import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { executeInsert, getPosDb, withTransaction } from '../db';

interface Device {
    id?: number;
    label: string;
    key: string;
    userId?: number;
    backscreenCom?: string | null;
    backscreenBaud?: number | null;
    printerCom?: string | null;
    printerBaud?: number | null;
    cashDrawerCom?: string | null;
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

                const backscreenCom = device.backscreenCom ?? null;
                const backscreenBaud = device.backscreenBaud ?? null;
                const printerCom = device.printerCom ?? null;
                const printerBaud = device.printerBaud ?? null;
                const cashDrawerCom = device.cashDrawerCom ?? null;

                if (device.id) {
                    // Update existing device by id
                    await db.execute(
                        db.isPostgreSQL
                            ? 'UPDATE dc_pos.devices SET label = $1, public_key = $2, user_id = $3, backscreen_com = $4, backscreen_baud = $5, printer_com = $6, printer_baud = $7, cash_drawer_com = $8 WHERE id = $9'
                            : 'UPDATE devices SET label = ?, public_key = ?, user_id = ?, backscreen_com = ?, backscreen_baud = ?, printer_com = ?, printer_baud = ?, cash_drawer_com = ? WHERE id = ?',
                        [
                            label,
                            key,
                            userId,
                            backscreenCom,
                            backscreenBaud,
                            printerCom,
                            printerBaud,
                            cashDrawerCom,
                            device.id,
                        ]
                    );
                    savedIds.push(device.id);
                    continue;
                }

                // Try to find existing device by public key
                const [findRows] = await db.execute(
                    db.isPostgreSQL
                        ? 'SELECT id FROM dc_pos.devices WHERE public_key = $1 LIMIT 1'
                        : 'SELECT id FROM devices WHERE public_key = ? LIMIT 1',
                    [key]
                );
                const existingId = (findRows as { id: number }[])[0]?.id;

                if (existingId) {
                    await db.execute(
                        db.isPostgreSQL
                            ? 'UPDATE dc_pos.devices SET label = $1, user_id = $2, backscreen_com = $3, backscreen_baud = $4, printer_com = $5, printer_baud = $6, cash_drawer_com = $7 WHERE id = $8'
                            : 'UPDATE devices SET label = ?, user_id = ?, backscreen_com = ?, backscreen_baud = ?, printer_com = ?, printer_baud = ?, cash_drawer_com = ? WHERE id = ?',
                        [
                            label,
                            userId,
                            backscreenCom,
                            backscreenBaud,
                            printerCom,
                            printerBaud,
                            cashDrawerCom,
                            existingId,
                        ]
                    );
                    savedIds.push(existingId);
                } else {
                    const newId = await executeInsert(
                        db,
                        'INSERT INTO dc_pos.devices (label, public_key, user_id, backscreen_com, backscreen_baud, printer_com, printer_baud, cash_drawer_com) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                        'INSERT INTO devices (label, public_key, user_id, backscreen_com, backscreen_baud, printer_com, printer_baud, cash_drawer_com) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [label, key, userId, backscreenCom, backscreenBaud, printerCom, printerBaud, cashDrawerCom]
                    );
                    if (newId) {
                        savedIds.push(newId);
                    }
                }
            }

            // Delete devices that are not in the incoming list
            if (savedIds.length > 0) {
                const placeholders = savedIds.map((_, i) => (db.isPostgreSQL ? `$${i + 1}` : '?')).join(',');
                await db.execute(
                    db.isPostgreSQL
                        ? `DELETE FROM dc_pos.devices WHERE id NOT IN (${placeholders})`
                        : `DELETE FROM devices WHERE id NOT IN (${placeholders})`,
                    savedIds
                );
            } else {
                await db.execute(db.isPostgreSQL ? 'DELETE FROM dc_pos.devices' : 'DELETE FROM devices');
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
