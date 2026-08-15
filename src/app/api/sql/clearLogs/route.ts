import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export const dynamic = 'force-dynamic';

// Clear logs for this device on app startup, mirroring the log file behaviour
// (fs.createWriteStream with flags: 'w' truncates the file on every start).
// The request body contains the device public key as `source`.
export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection;
    try {
        const { source } = (await request.json()) as { source?: string };
        connection = await getPosDb(shopId);
        const query = connection.isPostgreSQL
            ? 'DELETE FROM dc_sys.logs WHERE source = $1'
            : 'DELETE FROM logs WHERE source = ?';
        await connection.execute(query, [source ?? null]);
        await connection.end();
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error clearing logs:', error);
        return NextResponse.json({ error: 'An error occurred while clearing logs' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
