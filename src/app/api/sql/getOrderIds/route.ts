import { getShopIdFromRequest } from '@/app/constants/shop';
import { assertDeviceAuthorized } from '../deviceAuth';
import { NextResponse } from 'next/server';
import { dayBounds, getPosDb, DbConnection } from '../db';

// The reconcile sweep diffs a local day file against the server before
// pushing: this returns the day's order_ids so the client only sends the
// rows actually missing — one round trip instead of one per row already
// synced.
export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const date = new URL(request.url).searchParams.get('date') ?? '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json({ error: 'date must be in YYYY-MM-DD format' }, { status: 400 });
        }

        connection = await getPosDb(shopId);
        const deviceGuard = await assertDeviceAuthorized(request, shopId, undefined, connection);
        if (deviceGuard) return deviceGuard;

        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';
        const [rows] = await connection.execute(
            `SELECT order_id FROM ${prefix}transactions WHERE created_at >= ${isPg ? '$1' : '?'} AND created_at < ${isPg ? '$2' : '?'}`,
            [...dayBounds(date)]
        );
        const orderIds = (rows as { order_id: string | number }[]).map((row) => String(row.order_id));

        return NextResponse.json({ orderIds }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching order ids' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
