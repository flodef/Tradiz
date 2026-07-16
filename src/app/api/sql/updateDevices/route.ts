import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { executeInsert, getPosDb, withTransaction } from '../db';

interface Device {
    id?: number;
    label: string;
    key: string;
    userId?: number;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: Awaited<ReturnType<typeof getPosDb>> | undefined;

    try {
        const { devices } = (await request.json()) as { devices: Device[] };

        if (!Array.isArray(devices)) {
            return NextResponse.json({ error: 'Invalid devices data' }, { status: 400 });
        }

        connection = await getPosDb(shopId);
        const db = connection;

        await withTransaction(db, async () => {
            const savedIds: number[] = [];
            for (const device of devices) {
                const label = device.label || '';
                const key = device.key || '';
                const userId = device.userId ?? null;

                if (device.id) {
                    // Update existing device by id
                    await db.execute(
                        db.isPostgreSQL
                            ? 'UPDATE devices SET label = $1, public_key = $2, user_id = $3 WHERE id = $4'
                            : 'UPDATE devices SET label = ?, public_key = ?, user_id = ? WHERE id = ?',
                        [label, key, userId, device.id]
                    );
                    savedIds.push(device.id);
                    continue;
                }

                // Try to find existing device by public key
                const [findRows] = await db.execute(
                    db.isPostgreSQL
                        ? 'SELECT id FROM devices WHERE public_key = $1 LIMIT 1'
                        : 'SELECT id FROM devices WHERE public_key = ? LIMIT 1',
                    [key]
                );
                const existingId = (findRows as { id: number }[])[0]?.id;

                if (existingId) {
                    await db.execute(
                        db.isPostgreSQL
                            ? 'UPDATE devices SET label = $1, user_id = $2 WHERE id = $3'
                            : 'UPDATE devices SET label = ?, user_id = ? WHERE id = ?',
                        [label, userId, existingId]
                    );
                    savedIds.push(existingId);
                } else {
                    const newId = await executeInsert(
                        db,
                        'INSERT INTO devices (label, public_key, user_id) VALUES ($1, $2, $3) RETURNING id',
                        'INSERT INTO devices (label, public_key, user_id) VALUES (?, ?, ?)',
                        [label, key, userId]
                    );
                    if (newId) {
                        savedIds.push(newId);
                    }
                }
            }

            // Delete devices that are not in the incoming list
            if (savedIds.length > 0) {
                const placeholders = savedIds.map((_, i) => (db.isPostgreSQL ? `$${i + 1}` : '?')).join(',');
                await db.execute(`DELETE FROM devices WHERE id NOT IN (${placeholders})`, savedIds);
            } else {
                await db.execute('DELETE FROM devices');
            }
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating devices:', error);
        return NextResponse.json({ error: 'An error occurred while updating devices' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
