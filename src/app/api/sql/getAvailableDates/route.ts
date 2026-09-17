import { getShopIdFromRequest } from '@/app/constants/shop';
import { assertDeviceAuthorized } from '../deviceAuth';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);
        const deviceGuard = await assertDeviceAuthorized(request, shopId, undefined, connection);
        if (deviceGuard) return deviceGuard;

        // Note: no user_name filter here to stay consistent with getTransactions,
        // which returns transactions for all users. Dates are formatted as YYYY-MM-DD
        // strings so the client can group/compare them reliably.
        const query = connection.isPostgreSQL
            ? `
            SELECT TO_CHAR(DATE(t.created_at), 'YYYY-MM-DD') as date, COUNT(*)::int as count
            FROM dc_pos.transactions t
            WHERE t.created_at IS NOT NULL
            GROUP BY 1
            ORDER BY date DESC
        `
            : `
            SELECT DATE_FORMAT(t.created_at, '%Y-%m-%d') as date, COUNT(*) as count
            FROM transactions t
            WHERE t.created_at IS NOT NULL
            GROUP BY 1
            ORDER BY date DESC
        `;

        const [rows] = await connection.execute(query);
        const dates = (rows as { date: string }[]).map((row) => row.date);
        const counts = Object.fromEntries(
            (rows as { date: string; count: number }[]).map((row) => [row.date, row.count])
        );

        // Sealed days let the client skip pushing day files that can never
        // accept writes — without this it wastes one POST per stranded tx on
        // every startup.
        const closureQuery = connection.isPostgreSQL
            ? `SELECT TO_CHAR(closure_date, 'YYYY-MM-DD') as date FROM dc_pos.daily_closures`
            : `SELECT DATE_FORMAT(closure_date, '%Y-%m-%d') as date FROM daily_closures`;
        const [closureRows] = await connection.execute(closureQuery);
        const closedDays = (closureRows as { date: string }[]).map((row) => row.date);

        await connection.end();

        return NextResponse.json({ dates, counts, closedDays }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching available dates' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
