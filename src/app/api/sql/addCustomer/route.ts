import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';
import { generateProductReference } from '@/app/utils/productReference';
import { normalizeFirstName, normalizeFamilyName } from '@/app/utils/regex';

interface Customer {
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
        const customer = (await request.json()) as Customer;

        if (!customer.firstName || !customer.lastName) {
            return NextResponse.json({ error: 'Missing required fields: firstName and lastName' }, { status: 400 });
        }

        const connection = await getPosDb(shopId);

        const firstName = normalizeFirstName(customer.firstName);
        const lastName = normalizeFamilyName(customer.lastName);
        const reference = customer.reference ? String(customer.reference) : null;
        const email = customer.email || null;
        const phone = customer.phone || null;
        const company = customer.company || null;
        const balance = customer.balance || 0;

        let customerId;
        let generatedReference: string;
        if (connection.isPostgreSQL) {
            const insertQuery = `
                INSERT INTO dc_pos.customers (first_name, last_name, reference, email, phone, company, balance)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `;
            const [result] = await connection.execute(insertQuery, [
                firstName,
                lastName,
                reference,
                email,
                phone,
                company,
                balance,
            ]);
            customerId = (result as { id: number }[])[0].id;

            generatedReference = customer.reference ? String(customer.reference) : generateProductReference(customerId);
            await connection.execute('UPDATE dc_pos.customers SET reference = $1 WHERE id = $2', [
                generatedReference,
                customerId,
            ]);
        } else {
            const insertQuery = `
                INSERT INTO customers (first_name, last_name, reference, email, phone, company, balance)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const [result] = await connection.execute(insertQuery, [
                firstName,
                lastName,
                reference,
                email,
                phone,
                company,
                balance,
            ]);
            customerId = (result as unknown as { insertId: number }).insertId;

            generatedReference = customer.reference ? String(customer.reference) : generateProductReference(customerId);
            await connection.execute('UPDATE customers SET reference = ? WHERE id = ?', [
                generatedReference,
                customerId,
            ]);
        }

        await connection.end();

        return NextResponse.json(
            {
                success: true,
                customerId,
                customer: { ...customer, firstName, lastName, id: customerId, reference: generatedReference },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Error adding customer:', error);
        return NextResponse.json({ error: 'An error occurred while adding customer' }, { status: 500 });
    }
}
