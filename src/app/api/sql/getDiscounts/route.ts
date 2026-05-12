import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface DiscountRow {
    value: number;
    unity: string;
}

export async function GET() {
    try {
        const connection = await getPosDb();

        // Fetch discounts: unity column contains either '%' or currency symbol
        const query = connection.isPostgreSQL
            ? 'SELECT value, unity FROM discounts ORDER BY id'
            : 'SELECT value, unity FROM discounts ORDER BY id';

        const [rows] = await connection.execute(query);
        await connection.end();

        const discountRows = rows as DiscountRow[];

        // Return header row + data rows: [amount, unit]
        const values = [['Montant', 'Unité'], ...discountRows.map((row) => [Number(row.value), row.unity])];

        return NextResponse.json({ values }, { status: 200 });
    } catch (error) {
        console.error('Error fetching discounts:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
