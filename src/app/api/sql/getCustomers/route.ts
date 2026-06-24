import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface CustomerRow {
    id: number;
    first_name: string;
    last_name: string;
    reference: string | null;
    email: string | null;
    phone: string | null;
}

export async function GET() {
    try {
        const connection = await getPosDb();

        const query = connection.isPostgreSQL
            ? 'SELECT id, first_name, last_name, reference, email, phone FROM dc_pos.customers ORDER BY last_name, first_name'
            : 'SELECT id, first_name, last_name, reference, email, phone FROM customers ORDER BY last_name, first_name';

        const result = await connection.execute(query);
        const rows = result[0] as CustomerRow[];

        await connection.end();

        // Format as values array with header row
        const values = [
            ['id', 'first_name', 'last_name', 'reference', 'email', 'phone'],
            ...rows.map((row: CustomerRow) => [
                row.id,
                row.first_name,
                row.last_name,
                row.reference,
                row.email,
                row.phone,
            ]),
        ];

        return NextResponse.json({ values });
    } catch (error) {
        console.error('Error fetching customers:', error);
        return NextResponse.json({ error: 'An error occurred while fetching customers' }, { status: 500 });
    }
}
