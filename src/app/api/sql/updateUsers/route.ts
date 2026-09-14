import { getShopIdFromRequest } from '@/app/constants/shop';
import { stoppedSubscriptionResponse, subscriptionStopped } from '../subscriptionStore';
import { NextResponse } from 'next/server';
import { executeInsert, getPosDb, withTransaction } from '../db';
import { assertDeviceAuthorized, shopRequiresUserAuth } from '../deviceAuth';
import { generateProductReference } from '@/app/utils/productReference';
import { insertAuditEvent, resolveAuditActor } from '../auditHelpers';
import { hashPin } from '../pinHash';

class ConflictError extends Error {}

interface User {
    id?: number;
    name: string;
    role: string;
    reference?: string;
    /** New PIN to set (4-8 digits, write-only — hashed server-side). */
    pin?: string;
    /** Remove the user's PIN. */
    clearPin?: boolean;
}

const PIN_PATTERN = /^\d{4,8}$/;

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    const deviceGuard = await assertDeviceAuthorized(request, shopId, ['admin']);
    if (deviceGuard) return deviceGuard;
    let connection: Awaited<ReturnType<typeof getPosDb>> | undefined;

    try {
        const { users } = (await request.json()) as { users: User[] };

        if (!Array.isArray(users)) {
            return NextResponse.json({ error: 'Invalid users data' }, { status: 400 });
        }
        if (users.some((u) => u.pin && !PIN_PATTERN.test(u.pin))) {
            return NextResponse.json({ error: 'Invalid PIN: expected 4 to 8 digits' }, { status: 400 });
        }

        connection = await getPosDb(shopId);
        if (await subscriptionStopped(connection)) {
            return stoppedSubscriptionResponse();
        }
        const db = connection;

        // Applies pin/clearPin for a persisted user id — pin_hash is only
        // touched when the payload explicitly asks for it, so saving the user
        // list never erases an existing PIN silently. Counts feed the audit
        // detail (counts only — never the PIN nor its hash).
        let pinsSet = 0;
        let pinsCleared = 0;
        const applyPin = async (userId: number, user: User) => {
            if (user.clearPin) {
                pinsCleared++;
                await db.execute(
                    db.isPostgreSQL
                        ? 'UPDATE dc_pos.users SET pin_hash = NULL WHERE id = $1'
                        : 'UPDATE users SET pin_hash = NULL WHERE id = ?',
                    [userId]
                );
            } else if (user.pin) {
                pinsSet++;
                await db.execute(
                    db.isPostgreSQL
                        ? 'UPDATE dc_pos.users SET pin_hash = $1 WHERE id = $2'
                        : 'UPDATE users SET pin_hash = ? WHERE id = ?',
                    [await hashPin(user.pin), userId]
                );
            }
        };

        const savedUsers = await withTransaction(db, async () => {
            // Upsert users and collect their final ids
            const savedIds: number[] = [];
            for (const user of users) {
                const name = user.name;
                const role = user.role || 'Cashier';
                const providedReference = user.reference?.trim() || null;

                if (user.id) {
                    // Update existing user by id
                    await db.execute(
                        db.isPostgreSQL
                            ? 'UPDATE dc_pos.users SET name = $1, role = $2, reference = $3 WHERE id = $4'
                            : 'UPDATE users SET name = ?, role = ?, reference = ? WHERE id = ?',
                        [name, role, providedReference, user.id]
                    );
                    await applyPin(user.id, user);
                    savedIds.push(user.id);
                    continue;
                }

                // Only de-duplicate against an explicitly provided reference.
                // Auto-generated references are derived from the row id after insert,
                // so they are always unique and must not be used for matching.
                if (providedReference) {
                    const [findRows] = await db.execute(
                        db.isPostgreSQL
                            ? 'SELECT id FROM dc_pos.users WHERE reference = $1 LIMIT 1'
                            : 'SELECT id FROM users WHERE reference = ? LIMIT 1',
                        [providedReference]
                    );
                    const existingId = (findRows as { id: number }[])[0]?.id;
                    if (existingId) {
                        await db.execute(
                            db.isPostgreSQL
                                ? 'UPDATE dc_pos.users SET name = $1, role = $2, reference = $3 WHERE id = $4'
                                : 'UPDATE users SET name = ?, role = ?, reference = ? WHERE id = ?',
                            [name, role, providedReference, existingId]
                        );
                        await applyPin(existingId, user);
                        savedIds.push(existingId);
                        continue;
                    }
                }

                const newId = await executeInsert(
                    db,
                    'INSERT INTO dc_pos.users (name, role, reference) VALUES ($1, $2, $3) RETURNING id',
                    'INSERT INTO users (name, role, reference) VALUES (?, ?, ?)',
                    [name, role, providedReference]
                );

                if (newId) {
                    await applyPin(newId, user);
                    savedIds.push(newId);
                    // Derive a unique, valid EAN-13 reference from the new id when none was provided.
                    if (!providedReference) {
                        await db.execute(
                            db.isPostgreSQL
                                ? 'UPDATE dc_pos.users SET reference = $1 WHERE id = $2'
                                : 'UPDATE users SET reference = ? WHERE id = ?',
                            [generateProductReference(newId), newId]
                        );
                    }
                }
            }

            // Delete users that are not in the incoming list — but never the
            // users backing intervention devices (hidden from the UI, so they
            // are never sent; deleting them would orphan the devices and lose
            // the service access).
            const keepIntervention = db.isPostgreSQL
                ? 'AND id NOT IN (SELECT user_id FROM dc_pos.devices WHERE intervention AND user_id IS NOT NULL)'
                : 'AND id NOT IN (SELECT user_id FROM devices WHERE intervention = 1 AND user_id IS NOT NULL)';
            if (savedIds.length > 0) {
                const placeholders = savedIds.map((_, i) => (db.isPostgreSQL ? `$${i + 1}` : '?')).join(',');
                await db.execute(
                    db.isPostgreSQL
                        ? `DELETE FROM dc_pos.users WHERE id NOT IN (${placeholders}) ${keepIntervention}`
                        : `DELETE FROM users WHERE id NOT IN (${placeholders}) ${keepIntervention}`,
                    savedIds
                );
            } else {
                // No incoming users, delete all non-intervention users
                await db.execute(
                    db.isPostgreSQL
                        ? `DELETE FROM dc_pos.users WHERE true ${keepIntervention}`
                        : `DELETE FROM users WHERE true ${keepIntervention}`
                );
            }

            // When user auth is required, the resulting user list must keep
            // at least one Admin with a PIN — otherwise every admin is
            // locked out of admin-gated routes.
            if (await shopRequiresUserAuth(db)) {
                const [adminRows] = await db.execute(
                    db.isPostgreSQL
                        ? `SELECT 1 FROM dc_pos.users WHERE role = 'Admin' AND pin_hash IS NOT NULL LIMIT 1`
                        : `SELECT 1 FROM users WHERE role = 'Admin' AND pin_hash IS NOT NULL LIMIT 1`,
                    []
                );
                if (!(adminRows as unknown[]).length) {
                    throw new ConflictError(
                        "Impossible : plus aucun utilisateur Admin n'aurait de PIN alors que l'authentification est requise."
                    );
                }
            }

            const [savedRows] = await db.execute(
                db.isPostgreSQL
                    ? `SELECT u.id, u.name, u.role, u.reference, u.pin_hash FROM dc_pos.users u
                       WHERE NOT EXISTS (SELECT 1 FROM dc_pos.devices d WHERE d.user_id = u.id AND d.intervention)
                       ORDER BY u.name`
                    : `SELECT u.id, u.name, u.role, u.reference, u.pin_hash FROM users u
                       WHERE NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.intervention = 1)
                       ORDER BY u.name`
            );
            return (
                savedRows as { id: number; name: string; role: string; reference?: string; pin_hash?: string }[]
            ).map((row) => ({
                id: Number(row.id),
                name: row.name,
                role: row.role,
                reference: row.reference,
                hasPin: !!row.pin_hash,
            }));
        });

        await insertAuditEvent(connection, {
            event_type: 'user_change',
            entity_type: 'users',
            entity_id: 'users',
            user_name: await resolveAuditActor(request, connection, shopId),
            detail:
                `Updated ${users.length} user(s)` +
                (pinsSet ? `, ${pinsSet} PIN set/changed` : '') +
                (pinsCleared ? `, ${pinsCleared} PIN cleared` : ''),
        });

        return NextResponse.json({ success: true, users: savedUsers }, { status: 200 });
    } catch (error) {
        if (error instanceof ConflictError) {
            return NextResponse.json({ error: error.message }, { status: 409 });
        }
        console.error('Error updating users:', error);
        return NextResponse.json({ error: 'An error occurred while updating users' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
