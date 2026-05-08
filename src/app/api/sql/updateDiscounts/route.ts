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

        // Get all currencies for symbol lookup
        const currencyQuery = connection.isPostgreSQL
            ? 'SELECT id, symbol FROM currency'
            : 'SELECT id, symbol FROM currency';
        const [currencyRows] = await connection.execute(currencyQuery);
        const currencyMap = new Map<string, number>();
        for (const row of currencyRows as { id: number; symbol: string }[]) {
            currencyMap.set(row.symbol, row.id);
        }

        // Insert discounts
        for (const discount of discounts as DiscountUpdate[]) {
            const value = discount.amount;
            const unity = discount.unit.trim();

            if (!isNaN(value) && unity) {
                let unity_type: string;
                let currency_id: number | null;

                if (unity === '%') {
                    unity_type = '%';
                    currency_id = null;
                } else {
                    // Look up currency by symbol
                    unity_type = 'currency';
                    currency_id = currencyMap.get(unity) || null;

                    if (!currency_id) {
                        console.warn(`Currency symbol "${unity}" not found, skipping discount with value ${value}`);
                        continue;
                    }
                }

                const insertQuery = connection.isPostgreSQL
                    ? 'INSERT INTO discounts (value, unity_type, currency_id) VALUES ($1, $2, $3)'
                    : 'INSERT INTO discounts (value, unity_type, currency_id) VALUES (?, ?, ?)';
                await connection.execute(insertQuery, [value, unity_type, currency_id]);
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating discounts' }, { status: 500 });
    }
}
