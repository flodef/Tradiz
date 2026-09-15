import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { executeInsert, getPosDb, withTransaction } from '../db';
import { authorizeDeviceOn, resolveUserSession } from '../deviceAuth';
import { insertAuditEvent } from '../auditHelpers';
import { SUBSCRIPTION_PLANS } from '@/app/utils/subscription';
import { readSubscription, stoppedSubscriptionResponse } from '../subscriptionStore';

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
    cashDrawerBaud?: number | null;
    intervention?: boolean;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: Awaited<ReturnType<typeof getPosDb>> | undefined;

    try {
        connection = await getPosDb(shopId);
        // Authorize on the route's own connection — one resolution, and the
        // caller's device id is needed below to protect it from deletion.
        const authResult = await authorizeDeviceOn(request, connection, shopId, ['admin']);
        if (authResult instanceof NextResponse) return authResult;
        const callerDeviceId = authResult.deviceId;

        const { devices } = (await request.json()) as { devices: Device[] };

        if (!Array.isArray(devices)) {
            return NextResponse.json({ error: 'Invalid devices data' }, { status: 400 });
        }

        const db = connection;

        // Plan limit: the formule caps the number of caisses (devices).
        const sub = await readSubscription(db);
        if (sub.status === 'stopped') return stoppedSubscriptionResponse();
        const limits = SUBSCRIPTION_PLANS[sub.plan].limits;
        // Service/admin devices (intervention flag) are never sent by the UI
        // (getDevices filters them) and don't count toward the quota — a
        // forged `intervention: true` in the body is ignored below anyway.
        const billableCount = devices.length;
        if (billableCount > limits.maxDevices) {
            return NextResponse.json(
                {
                    error: `Votre formule ${SUBSCRIPTION_PLANS[sub.plan].name} est limitée à ${limits.maxDevices} caisse(s). Passez à une formule supérieure pour en ajouter.`,
                },
                { status: 403 }
            );
        }

        const [countRows] = await db.execute(
            db.isPostgreSQL
                ? 'SELECT COUNT(*) AS count FROM dc_pos.devices WHERE NOT intervention'
                : 'SELECT COUNT(*) AS count FROM devices WHERE NOT intervention',
            []
        );
        const beforeCount = Number((countRows as { count: number | string }[])[0]?.count) || 0;
        let added = 0;
        let updated = 0;
        let revoked = 0;

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
                const cashDrawerBaud = device.cashDrawerBaud ?? null;

                // The intervention flag is DB-managed only — never trust it
                // from the request body (it would bypass the device quota and
                // hide devices from the admin UI). Intervention ROWS are also
                // untouchable here: `AND NOT intervention` on every write so
                // a forged id/key can't hijack a service device.
                if (device.id) {
                    // Update existing device by id — never an intervention row.
                    const updateQuery = db.isPostgreSQL
                        ? 'UPDATE dc_pos.devices SET label = $1, public_key = $2, user_id = $3, backscreen_com = $4, backscreen_baud = $5, printer_com = $6, printer_baud = $7, cash_drawer_com = $8, cash_drawer_baud = $9 WHERE id = $10 AND NOT intervention RETURNING id'
                        : 'UPDATE devices SET label = ?, public_key = ?, user_id = ?, backscreen_com = ?, backscreen_baud = ?, printer_com = ?, printer_baud = ?, cash_drawer_com = ?, cash_drawer_baud = ? WHERE id = ? AND NOT intervention';
                    const [updRows, updResult] = await db.execute(updateQuery, [
                        label,
                        key,
                        userId,
                        backscreenCom,
                        backscreenBaud,
                        printerCom,
                        printerBaud,
                        cashDrawerCom,
                        cashDrawerBaud,
                        device.id,
                    ]);
                    const affected = db.isPostgreSQL
                        ? (updRows as { id: number }[]).length
                        : Number((updResult as { affectedRows?: number }).affectedRows ?? 0);
                    if (affected > 0) {
                        savedIds.push(device.id);
                        updated++;
                    }
                    continue;
                }

                // Try to find existing device by public key — an intervention
                // row must never be matched (a forged body carrying its key
                // would otherwise rewrite the service device).
                const [findRows] = await db.execute(
                    db.isPostgreSQL
                        ? 'SELECT id, intervention FROM dc_pos.devices WHERE public_key = $1 LIMIT 1'
                        : 'SELECT id, intervention FROM devices WHERE public_key = ? LIMIT 1',
                    [key]
                );
                const found = (findRows as { id: number; intervention: number | boolean }[])[0];
                const existingId = found && !found.intervention ? found.id : undefined;

                if (existingId) {
                    await db.execute(
                        db.isPostgreSQL
                            ? 'UPDATE dc_pos.devices SET label = $1, user_id = $2, backscreen_com = $3, backscreen_baud = $4, printer_com = $5, printer_baud = $6, cash_drawer_com = $7, cash_drawer_baud = $8 WHERE id = $9'
                            : 'UPDATE devices SET label = ?, user_id = ?, backscreen_com = ?, backscreen_baud = ?, printer_com = ?, printer_baud = ?, cash_drawer_com = ?, cash_drawer_baud = ? WHERE id = ?',
                        [
                            label,
                            userId,
                            backscreenCom,
                            backscreenBaud,
                            printerCom,
                            printerBaud,
                            cashDrawerCom,
                            cashDrawerBaud,
                            existingId,
                        ]
                    );
                    savedIds.push(existingId);
                    updated++;
                } else if (!found) {
                    const newId = await executeInsert(
                        db,
                        'INSERT INTO dc_pos.devices (label, public_key, user_id, backscreen_com, backscreen_baud, printer_com, printer_baud, cash_drawer_com, cash_drawer_baud) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
                        'INSERT INTO devices (label, public_key, user_id, backscreen_com, backscreen_baud, printer_com, printer_baud, cash_drawer_com, cash_drawer_baud) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [
                            label,
                            key,
                            userId,
                            backscreenCom,
                            backscreenBaud,
                            printerCom,
                            printerBaud,
                            cashDrawerCom,
                            cashDrawerBaud,
                        ]
                    );
                    if (newId) {
                        savedIds.push(newId);
                        added++;
                    }
                }
                // found.intervention → skip silently: the service row is left untouched.
            }

            // Delete devices that are not in the incoming list. Two rows are
            // always preserved: intervention devices (never sent by the UI)
            // and the CALLING device — a payload can never brick the terminal
            // it is sent from (which would leave the shop with no way to
            // reach admin routes).
            const protectCaller = callerDeviceId
                ? ` AND id <> ${db.isPostgreSQL ? `$${savedIds.length + 1}` : '?'}`
                : '';
            if (savedIds.length > 0 || callerDeviceId) {
                const placeholders = savedIds.map((_, i) => (db.isPostgreSQL ? `$${i + 1}` : '?')).join(',');
                const notInClause = savedIds.length ? ` AND id NOT IN (${placeholders})` : '';
                await db.execute(
                    db.isPostgreSQL
                        ? `DELETE FROM dc_pos.devices WHERE NOT intervention${notInClause}${protectCaller}`
                        : `DELETE FROM devices WHERE NOT intervention${notInClause}${protectCaller}`,
                    callerDeviceId ? [...savedIds, callerDeviceId] : savedIds
                );
            } else {
                await db.execute(
                    db.isPostgreSQL
                        ? 'DELETE FROM dc_pos.devices WHERE NOT intervention'
                        : 'DELETE FROM devices WHERE NOT intervention'
                );
            }

            // Revoked = previously billable devices that no longer exist.
            const [afterRows] = await db.execute(
                db.isPostgreSQL
                    ? 'SELECT COUNT(*) AS count FROM dc_pos.devices WHERE NOT intervention'
                    : 'SELECT COUNT(*) AS count FROM devices WHERE NOT intervention',
                []
            );
            const afterCount = Number((afterRows as { count: number | string }[])[0]?.count) || 0;
            revoked = Math.max(0, beforeCount - (afterCount - added));

            // Device list changes grant/revoke API access — always audit
            // them, INSIDE the transaction so a failed audit can't leave an
            // unaudited change committed. Keys are never logged. The caller
            // device is already resolved (authResult) — only the session
            // lookup remains.
            const session = callerDeviceId ? await resolveUserSession(request, db, callerDeviceId) : null;
            await insertAuditEvent(db, {
                event_type: 'device_change',
                entity_type: 'devices',
                entity_id: 'devices',
                user_name: session?.name ?? authResult.userName ?? 'inconnu',
                detail: `${added} added, ${updated} updated, ${revoked} revoked`,
            });
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating devices:', error);
        return NextResponse.json({ error: 'An error occurred while updating devices' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
