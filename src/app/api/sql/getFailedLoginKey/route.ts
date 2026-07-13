import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export const dynamic = 'force-dynamic';

interface LogRow {
    public_key: string;
}

export async function GET() {
    try {
        const connection = await getPosDb();

        const query = connection.isPostgreSQL
            ? `SELECT l.metadata->>'public_key' AS public_key
               FROM dc_sys.logs l
               WHERE l.level = 'error'
                 AND l.metadata->>'success' = 'false'
                 AND l.metadata->>'type' = 'access_attempt'
                 AND NOT EXISTS (
                     SELECT 1 FROM devices d WHERE d.public_key = l.metadata->>'public_key'
                 )
               ORDER BY l.created_at DESC
               LIMIT 1`
            : `SELECT JSON_UNQUOTE(JSON_EXTRACT(l.metadata, '$.public_key')) AS public_key
               FROM dc_sys.logs l
               WHERE l.level = 'error'
                 AND JSON_EXTRACT(l.metadata, '$.success') = 'false'
                 AND JSON_EXTRACT(l.metadata, '$.type') = 'access_attempt'
                 AND NOT EXISTS (
                     SELECT 1 FROM devices d WHERE d.public_key = JSON_UNQUOTE(JSON_EXTRACT(l.metadata, '$.public_key'))
                 )
               ORDER BY l.created_at DESC
               LIMIT 1`;

        const [rows] = await connection.execute(query);
        const found = (rows as LogRow[])[0];

        await connection.end();

        return NextResponse.json({ key: found ? String(found.public_key) : null });
    } catch (error) {
        console.error('Error fetching failed login key:', error);
        return NextResponse.json({ error: 'An error occurred while fetching failed login key' }, { status: 500 });
    }
}
