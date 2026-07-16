import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const connection = await getPosDb(shopId);

        // Note: no user_name filter here to stay consistent with getTransactions,
        // which returns transactions for all users. Dates are formatted as YYYY-MM-DD
        // strings so the client can group/compare them reliably.
        const query = connection.isPostgreSQL
            ? `
            SELECT DISTINCT TO_CHAR(DATE(t.created_at), 'YYYY-MM-DD') as date
            FROM dc_pos.transactions t
            WHERE t.created_at IS NOT NULL
            ORDER BY date DESC
        `
            : `
            SELECT DISTINCT DATE_FORMAT(t.created_at, '%Y-%m-%d') as date
            FROM transactions t
            WHERE t.created_at IS NOT NULL
            ORDER BY date DESC
        `;

        const [rows] = await connection.execute(query);
        const dates = (rows as { date: string }[]).map((row) => row.date);

        await connection.end();

        return NextResponse.json({ dates }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching available dates' }, { status: 500 });
    }
}
