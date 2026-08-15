import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

export const dynamic = 'force-dynamic';

interface LogEntry {
    level: string;
    message: string;
    source?: string;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { logs } = (await request.json()) as { logs: LogEntry[] };

        if (!Array.isArray(logs) || logs.length === 0) {
            return NextResponse.json({ error: 'Logs array is required' }, { status: 400 });
        }
        if (logs.length > 1000) {
            return NextResponse.json({ error: 'Logs array too large (max 1000)' }, { status: 400 });
        }

        connection = await getPosDb(shopId);

        for (const log of logs) {
            if (!log.level || !log.message) continue;
            const query = connection.isPostgreSQL
                ? `INSERT INTO dc_sys.logs (level, message, source) VALUES ($1, $2, $3)`
                : `INSERT INTO dc_sys.logs (level, message, source) VALUES (?, ?, ?)`;
            await connection.execute(query, [log.level, log.message, log.source ?? null]);
        }

        return NextResponse.json({ success: true, count: logs.length }, { status: 200 });
    } catch (error) {
        console.error('Error saving logs:', error);
        return NextResponse.json({ error: 'An error occurred while saving logs' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
