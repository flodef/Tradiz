import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let publicKey: string | undefined;

    try {
        const body = await request.json();
        publicKey = body.publicKey;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!publicKey) {
        return NextResponse.json({ error: 'Missing publicKey' }, { status: 400 });
    }

    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);

        // Mark devices that haven't been seen recently as disconnected.
        // Keep last_seen so it can still be used for diagnostics.
        const markStaleQuery = connection.isPostgreSQL
            ? `UPDATE dc_pos.devices SET connected = false WHERE connected = true AND last_seen < NOW() - INTERVAL '2 minutes'`
            : `UPDATE devices SET connected = false WHERE connected = true AND last_seen < DATE_SUB(NOW(), INTERVAL 2 MINUTE)`;
        await connection.execute(markStaleQuery);

        // Register this device's heartbeat.
        const heartbeatQuery = connection.isPostgreSQL
            ? `UPDATE dc_pos.devices SET connected = true, last_seen = NOW() WHERE public_key = $1`
            : `UPDATE devices SET connected = true, last_seen = NOW() WHERE public_key = ?`;
        const [result] = await connection.execute(heartbeatQuery, [publicKey]);

        // If the device isn't registered yet (UPDATE affected 0 rows), insert it
        // so other devices can detect it via the count query below.
        const affectedRows = connection.isPostgreSQL
            ? (result as { rowCount?: number }).rowCount ?? 0
            : (result as { affectedRows?: number }).affectedRows ?? 0;
        if (affectedRows === 0) {
            const insertQuery = connection.isPostgreSQL
                ? `INSERT INTO dc_pos.devices (label, public_key, connected, last_seen) VALUES ($1, $2, true, NOW()) ON CONFLICT (public_key) DO UPDATE SET connected = true, last_seen = NOW()`
                : `INSERT INTO devices (label, public_key, connected, last_seen) VALUES (?, ?, true, NOW()) ON DUPLICATE KEY UPDATE connected = true, last_seen = NOW()`;
            await connection.execute(insertQuery, [publicKey.slice(0, 8), publicKey]);
        }

        // Count other devices that are currently active.
        const countQuery = connection.isPostgreSQL
            ? `
            SELECT COUNT(*)::int AS count
            FROM dc_pos.devices
            WHERE public_key != $1 AND connected = true AND last_seen > NOW() - INTERVAL '30 seconds'
        `
            : `
            SELECT COUNT(*) AS count
            FROM devices
            WHERE public_key != ? AND connected = true AND last_seen > DATE_SUB(NOW(), INTERVAL 30 SECOND)
        `;

        const [rows] = await connection.execute(countQuery, [publicKey]);

        const count = Number((rows as { count: number }[])[0]?.count ?? 0);
        return NextResponse.json({ otherDevices: count }, { status: 200 });
    } catch (error) {
        console.error('Heartbeat failed:', error);
        return NextResponse.json({ error: 'Failed to process heartbeat' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
