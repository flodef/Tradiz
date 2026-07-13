import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface Device {
    id?: number;
    label: string;
    key: string;
    userId?: number;
}

export async function POST(request: Request) {
    try {
        const { devices } = (await request.json()) as { devices: Device[] };

        if (!Array.isArray(devices)) {
            return NextResponse.json({ error: 'Invalid devices data' }, { status: 400 });
        }

        const connection = await getPosDb();

        const savedIds: number[] = [];
        for (const device of devices) {
            const label = device.label || '';
            const key = device.key || '';
            const userId = device.userId ?? null;

            if (device.id) {
                // Update existing device by id
                const updateQuery = connection.isPostgreSQL
                    ? 'UPDATE devices SET label = $1, public_key = $2, user_id = $3 WHERE id = $4'
                    : 'UPDATE devices SET label = ?, public_key = ?, user_id = ? WHERE id = ?';
                await connection.execute(updateQuery, [label, key, userId, device.id]);
                savedIds.push(device.id);
            } else {
                // Try to find existing device by public key
                const findQuery = connection.isPostgreSQL
                    ? 'SELECT id FROM devices WHERE public_key = $1 LIMIT 1'
                    : 'SELECT id FROM devices WHERE public_key = ? LIMIT 1';
                const [findRows] = await connection.execute(findQuery, [key]);
                const existingId = (findRows as { id: number }[])[0]?.id;

                if (existingId) {
                    const updateQuery = connection.isPostgreSQL
                        ? 'UPDATE devices SET label = $1, user_id = $2 WHERE id = $3'
                        : 'UPDATE devices SET label = ?, user_id = ? WHERE id = ?';
                    await connection.execute(updateQuery, [label, userId, existingId]);
                    savedIds.push(existingId);
                } else {
                    const insertQuery = connection.isPostgreSQL
                        ? 'INSERT INTO devices (label, public_key, user_id) VALUES ($1, $2, $3) RETURNING id'
                        : 'INSERT INTO devices (label, public_key, user_id) VALUES (?, ?, ?)';
                    const [insertResult] = await connection.execute(insertQuery, [label, key, userId]);

                    const raw = insertResult as unknown;
                    const newId = connection.isPostgreSQL
                        ? (raw as { id: number }[])[0]?.id
                        : Number((raw as { insertId: number }).insertId);

                    if (newId) {
                        savedIds.push(newId);
                    }
                }
            }
        }

        // Delete devices that are not in the incoming list
        if (savedIds.length > 0) {
            const placeholders = savedIds.map((_, i) => (connection.isPostgreSQL ? `$${i + 1}` : '?')).join(',');
            const deleteQuery = `DELETE FROM devices WHERE id NOT IN (${placeholders})`;
            await connection.execute(deleteQuery, savedIds);
        } else {
            await connection.execute('DELETE FROM devices');
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating devices:', error);
        return NextResponse.json({ error: 'An error occurred while updating devices' }, { status: 500 });
    }
}
