import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export const dynamic = 'force-dynamic';

// Clear the dc_sys.logs table on app startup, mirroring the log file behaviour
// (fs.createWriteStream with flags: 'w' truncates the file on every start).
export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection;
    try {
        connection = await getPosDb(shopId);
        const query = connection.isPostgreSQL
            ? 'TRUNCATE TABLE dc_sys.logs'
            : 'TRUNCATE TABLE dc_sys.logs';
        await connection.execute(query);
        await connection.end();
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error clearing logs:', error);
        return NextResponse.json({ error: 'An error occurred while clearing logs' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
