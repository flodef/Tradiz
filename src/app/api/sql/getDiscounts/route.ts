import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface DiscountRow {
    value: number;
    unity_type: string;
    symbol: string | null;
}

export async function GET() {
    try {
        const connection = await getPosDb();

        // Fetch discounts with currency symbol if applicable
        const query = connection.isPostgreSQL
            ? `
            SELECT d.value, d.unity_type, c.symbol
            FROM discounts d
            LEFT JOIN currency c ON d.currency_id = c.id
            ORDER BY d.id
        `
            : `
            SELECT d.value, d.unity_type, c.symbol
            FROM discounts d
            LEFT JOIN currency c ON d.currency_id = c.id
            ORDER BY d.id
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const discountRows = rows as DiscountRow[];

        // Format discounts to match expected structure
        const discounts = discountRows.map((row) => ({
            amount: Number(row.value),
            unit: row.unity_type === '%' ? '%' : row.symbol || '%',
        }));

        return NextResponse.json(discounts, { status: 200 });
    } catch (error) {
        console.error('Error fetching discounts:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
