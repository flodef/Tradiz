import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';
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
    try {
        const { customers } = (await request.json()) as { customers: Customer[] };

        if (!Array.isArray(customers)) {
            return NextResponse.json({ error: 'Invalid customers data' }, { status: 400 });
        }

        const connection = await getPosDb(shopId);
        const table = connection.isPostgreSQL ? 'dc_pos.customers' : 'customers';

        // Delete only customers that are no longer present in the incoming list.
        // This preserves existing IDs and their linked balance_history (avoids the
        // ON DELETE CASCADE wiping all balance records on every save).
        const keptIds = customers.map((c) => c.id).filter((id): id is number => typeof id === 'number');
        if (keptIds.length > 0) {
            if (connection.isPostgreSQL) {
                const placeholders = keptIds.map((_, i) => `$${i + 1}`).join(', ');
                await connection.execute(`DELETE FROM ${table} WHERE id NOT IN (${placeholders})`, keptIds);
            } else {
                const placeholders = keptIds.map(() => '?').join(', ');
                await connection.execute(`DELETE FROM ${table} WHERE id NOT IN (${placeholders})`, keptIds);
            }
        } else {
            // No existing customers kept - remove all
            await connection.execute(`DELETE FROM ${table}`);
        }

        // Upsert customers
        for (const customer of customers) {
            const firstName = normalizeFirstName(customer.firstName);
            const lastName = normalizeFamilyName(customer.lastName);

            if (!firstName || !lastName) {
                await connection.end();
                return NextResponse.json({ error: 'Each customer must have a first and last name' }, { status: 400 });
            }

            if (customer.email && !emailRegex.test(customer.email)) {
                await connection.end();
                return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
            }

            if (customer.phone && !frenchPhoneRegex.test(customer.phone)) {
                await connection.end();
                return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
            }
            const email = customer.email || null;
            const phone = customer.phone || null;
            // Ensure company is a string, not an object
            let company = customer.company || null;
            if (typeof company === 'object' && company !== null) {
                company = (company as { name: string }).name || null;
            }

            if (typeof customer.id === 'number') {
                // Update existing customer - never touch balance (managed separately)
                const reference = customer.reference
                    ? String(customer.reference)
                    : generateProductReference(customer.id);
                if (connection.isPostgreSQL) {
                    await connection.execute(
                        `UPDATE ${table}
                         SET first_name = $1, last_name = $2, reference = $3, email = $4, phone = $5, company = $6
                         WHERE id = $7`,
                        [firstName, lastName, reference, email, phone, company, customer.id]
                    );
                } else {
                    await connection.execute(
                        `UPDATE ${table}
                         SET first_name = ?, last_name = ?, reference = ?, email = ?, phone = ?, company = ?
                         WHERE id = ?`,
                        [firstName, lastName, reference, email, phone, company, customer.id]
                    );
                }
            } else {
                // Insert new customer with a temporary NULL reference, then generate from the new id
                const balance = customer.balance || 0;
                let newId: number;
                if (connection.isPostgreSQL) {
                    const [insertResult] = await connection.execute(
                        `INSERT INTO ${table} (first_name, last_name, reference, email, phone, company, balance)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)
                         RETURNING id`,
                        [firstName, lastName, null, email, phone, company, balance]
                    );
                    newId = (insertResult as { id: number }[])[0].id;
                } else {
                    const [insertResult] = await connection.execute(
                        `INSERT INTO ${table} (first_name, last_name, reference, email, phone, company, balance)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [firstName, lastName, null, email, phone, company, balance]
                    );
                    newId = (insertResult as unknown as { insertId: number }).insertId;
                }

                const reference = generateProductReference(newId);
                if (connection.isPostgreSQL) {
                    await connection.execute(`UPDATE ${table} SET reference = $1 WHERE id = $2`, [reference, newId]);
                } else {
                    await connection.execute(`UPDATE ${table} SET reference = ? WHERE id = ?`, [reference, newId]);
                }
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating customers:', error);
        return NextResponse.json({ error: 'An error occurred while updating customers' }, { status: 500 });
    }
}
