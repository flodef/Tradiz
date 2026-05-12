import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface DiscountUpdate {
    amount: number;
    unit: string;
}

export async function POST(request: Request) {
    try {
        const { discounts } = await request.json();

        if (!discounts || !Array.isArray(discounts)) {
            return NextResponse.json({ error: 'Invalid discounts format' }, { status: 400 });
        }

        const connection = await getPosDb();

        // Clear existing discounts
        const deleteQuery = connection.isPostgreSQL ? 'DELETE FROM discounts' : 'DELETE FROM discounts';
        await connection.execute(deleteQuery);

        // Insert discounts: unity column stores either '%' or currency symbol directly
        for (const discount of discounts as DiscountUpdate[]) {
            const value = discount.amount;
            const unity = discount.unit.trim();

            if (!isNaN(value) && unity) {
                // unity is either '%' or a currency symbol like '€', '$', etc.
                const insertQuery = connection.isPostgreSQL
                    ? 'INSERT INTO discounts (value, unity) VALUES ($1, $2)'
                    : 'INSERT INTO discounts (value, unity) VALUES (?, ?)';
                await connection.execute(insertQuery, [value, unity]);
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating discounts' }, { status: 500 });
    }
}
