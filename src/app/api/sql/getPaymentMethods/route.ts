import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface PaymentMethodRow {
    label: string;
    address: string;
    currency: string;
    hidden: number;
}

export async function GET() {
    try {
        const connection = await getPosDb();

        const query = `
            SELECT label, address, currency, hidden
            FROM payment_methods
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const data: { values: (string | number | boolean)[][] } = { values: [] };
        data.values.push(['Type', 'ID', 'Monnaie', 'Masqué']);
        data.values.push(
            ...(rows as PaymentMethodRow[]).map((row): (string | number | boolean)[] => [
                String(row.label),
                String(row.address),
                String(row.currency),
                Boolean(row.hidden),
            ])
        );

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
