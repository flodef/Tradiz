import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, withTransaction, DbConnection } from '../db';
import { generateProductReference } from '@/app/utils/productReference';
import { normalizeFirstName, normalizeFamilyName, emailRegex, frenchPhoneRegex } from '@/app/utils/regex';

interface Customer {
    id?: number;
    firstName: string;
    lastName: string;
    reference?: string;
    email?: string;
    phone?: string;
    company?: string;
    balance?: number;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { customers } = (await request.json()) as { customers: Customer[] };

        if (!Array.isArray(customers)) {
            return NextResponse.json({ error: 'Invalid customers data' }, { status: 400 });
        }

        // Validate and normalize the whole batch upfront so we never persist a partial
        // set of customers when a later entry turns out to be invalid.
        const prepared: {
            id?: number;
            firstName: string;
            lastName: string;
            reference?: string;
            email: string | null;
            phone: string | null;
            company: string | null;
            balance: number;
        }[] = [];

        for (const customer of customers) {
            const firstName = normalizeFirstName(customer.firstName);
            const lastName = normalizeFamilyName(customer.lastName);

            if (!firstName || !lastName) {
                return NextResponse.json({ error: 'Each customer must have a first and last name' }, { status: 400 });
            }
            if (customer.email && !emailRegex.test(customer.email)) {
                return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
            }
            if (customer.phone && !frenchPhoneRegex.test(customer.phone)) {
                return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
            }

            // Ensure company is a string, not an object
            let company: string | null = customer.company || null;
            if (typeof company === 'object' && company !== null) {
                company = (company as { name: string }).name || null;
            }

            prepared.push({
                id: customer.id,
                firstName,
                lastName,
                reference: customer.reference,
                email: customer.email || null,
                phone: customer.phone || null,
                company,
                balance: customer.balance || 0,
            });
        }

        connection = await getPosDb(shopId);
        const conn = connection;
        const table = conn.isPostgreSQL ? 'dc_pos.customers' : 'customers';

        await withTransaction(conn, async () => {
            // Delete only customers that are no longer present in the incoming list.
            // This preserves existing IDs and their linked balance_history (avoids the
            // ON DELETE CASCADE wiping all balance records on every save).
            const keptIds = prepared.map((c) => c.id).filter((id): id is number => typeof id === 'number');
            if (keptIds.length > 0) {
                const placeholders = conn.isPostgreSQL
                    ? keptIds.map((_, i) => `$${i + 1}`).join(', ')
                    : keptIds.map(() => '?').join(', ');
                await conn.execute(`DELETE FROM ${table} WHERE id NOT IN (${placeholders})`, keptIds);
            } else {
                // No existing customers kept - remove all
                await conn.execute(`DELETE FROM ${table}`);
            }

            for (const customer of prepared) {
                const { firstName, lastName, email, phone, company } = customer;

                if (typeof customer.id === 'number') {
                    // Update existing customer - never touch balance (managed separately)
                    const reference = customer.reference
                        ? String(customer.reference)
                        : generateProductReference(customer.id);
                    const updateQuery = conn.isPostgreSQL
                        ? `UPDATE ${table}
                           SET first_name = $1, last_name = $2, reference = $3, email = $4, phone = $5, company = $6
                           WHERE id = $7`
                        : `UPDATE ${table}
                           SET first_name = ?, last_name = ?, reference = ?, email = ?, phone = ?, company = ?
                           WHERE id = ?`;
                    await conn.execute(updateQuery, [
                        firstName,
                        lastName,
                        reference,
                        email,
                        phone,
                        company,
                        customer.id,
                    ]);
                } else {
                    // Insert new customer with a temporary NULL reference, then generate from the new id
                    let newId: number;
                    if (conn.isPostgreSQL) {
                        const [insertResult] = await conn.execute(
                            `INSERT INTO ${table} (first_name, last_name, reference, email, phone, company, balance)
                             VALUES ($1, $2, $3, $4, $5, $6, $7)
                             RETURNING id`,
                            [firstName, lastName, null, email, phone, company, customer.balance]
                        );
                        newId = (insertResult as { id: number }[])[0].id;
                    } else {
                        const [insertResult] = await conn.execute(
                            `INSERT INTO ${table} (first_name, last_name, reference, email, phone, company, balance)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [firstName, lastName, null, email, phone, company, customer.balance]
                        );
                        newId = (insertResult as unknown as { insertId: number }).insertId;
                    }

                    const reference = generateProductReference(newId);
                    const refUpdateQuery = conn.isPostgreSQL
                        ? `UPDATE ${table} SET reference = $1 WHERE id = $2`
                        : `UPDATE ${table} SET reference = ? WHERE id = ?`;
                    await conn.execute(refUpdateQuery, [reference, newId]);
                }
            }
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating customers:', error);
        return NextResponse.json({ error: 'An error occurred while updating customers' }, { status: 500 });
    } finally {
        if (connection) await connection.end();
    }
}
