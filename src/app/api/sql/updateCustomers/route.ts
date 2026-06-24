import { NextResponse } from 'next/server';
import { getPosDb } from '../db';
import { generateProductReference } from '@/app/utils/productReference';

interface Customer {
    id?: number;
    firstName: string;
    lastName: string;
    reference?: string;
    email?: string;
    phone?: string;
}

export async function POST(request: Request) {
    try {
        const { customers } = (await request.json()) as { customers: Customer[] };

        if (!Array.isArray(customers)) {
            return NextResponse.json({ error: 'Invalid customers data' }, { status: 400 });
        }

        const connection = await getPosDb();

        // Delete all existing customers
        const deleteQuery = connection.isPostgreSQL ? 'DELETE FROM dc_pos.customers' : 'DELETE FROM customers';
        await connection.execute(deleteQuery);

        // Insert new customers
        for (const customer of customers) {
            const firstName = customer.firstName;
            const lastName = customer.lastName;
            // Auto-generate reference if not provided
            const reference = customer.reference || generateProductReference(Date.now());
            const email = customer.email || null;
            const phone = customer.phone || null;

            if (connection.isPostgreSQL) {
                const insertQuery = `
                    INSERT INTO dc_pos.customers (first_name, last_name, reference, email, phone)
                    VALUES ($1, $2, $3, $4, $5)
                `;
                await connection.execute(insertQuery, [firstName, lastName, reference, email, phone]);
            } else {
                const insertQuery = `
                    INSERT INTO customers (first_name, last_name, reference, email, phone)
                    VALUES (?, ?, ?, ?, ?)
                `;
                await connection.execute(insertQuery, [firstName, lastName, reference, email, phone]);
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating customers:', error);
        return NextResponse.json({ error: 'An error occurred while updating customers' }, { status: 500 });
    }
}
