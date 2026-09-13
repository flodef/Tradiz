import { getShopIdFromRequest } from '@/app/constants/shop';
import { stoppedSubscriptionResponse, subscriptionStopped } from '../subscriptionStore';
import { NextResponse } from 'next/server';
import { executeInsert, getPosDb, withTransaction } from '../db';
import { assertDeviceAuthorized } from '../deviceAuth';
import { generateProductReference } from '@/app/utils/productReference';
import { insertAuditEvent } from '../auditHelpers';

interface User {
    id?: number;
    name: string;
    role: string;
    reference?: string;
}

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

        connection = await getPosDb(shopId);
        if (await subscriptionStopped(connection)) {
            return stoppedSubscriptionResponse();
        }
        const db = connection;

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

            const [savedRows] = await db.execute(
                db.isPostgreSQL
                    ? `SELECT u.id, u.name, u.role, u.reference FROM dc_pos.users u
                       WHERE NOT EXISTS (SELECT 1 FROM dc_pos.devices d WHERE d.user_id = u.id AND d.intervention)
                       ORDER BY u.name`
                    : `SELECT u.id, u.name, u.role, u.reference FROM users u
                       WHERE NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.intervention = 1)
                       ORDER BY u.name`
            );
            return (savedRows as { id: number; name: string; role: string; reference?: string }[]).map((row) => ({
                id: Number(row.id),
                name: row.name,
                role: row.role,
                reference: row.reference,
            }));
        });

        await insertAuditEvent(connection, {
            event_type: 'user_change',
            entity_type: 'users',
            entity_id: 'users',
            user_name: 'admin',
            detail: `Updated ${users.length} user(s)`,
        });

        return NextResponse.json({ success: true, users: savedUsers }, { status: 200 });
    } catch (error) {
        console.error('Error updating users:', error);
        return NextResponse.json({ error: 'An error occurred while updating users' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
