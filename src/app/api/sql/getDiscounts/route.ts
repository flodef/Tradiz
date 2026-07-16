import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface DiscountRow {
    value: number;
    unity: string;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const connection = await getPosDb(shopId);

        // Fetch discounts: unity column contains either '%' or currency symbol
        const query = connection.isPostgreSQL
            ? 'SELECT value, unity FROM dc_pos.discounts ORDER BY id'
            : 'SELECT value, unity FROM discounts ORDER BY id';

        const [rows] = await connection.execute(query);
        await connection.end();

        const discounts = (rows as DiscountRow[]).map((row) => ({
            amount: Number(row.value),
            unit: String(row.unity).trim(),
        }));

        return NextResponse.json({ discounts }, { status: 200 });
    } catch (error) {
        console.error('Error fetching discounts:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
