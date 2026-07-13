import { NextResponse } from 'next/server';
import { executeInsert, getPosDb, withTransaction } from '../db';
import { generateProductReference } from '@/app/utils/productReference';

interface User {
    id?: number;
    name: string;
    role: string;
    reference?: string;
}

export async function POST(request: Request) {
    let connection: Awaited<ReturnType<typeof getPosDb>> | undefined;

    try {
        const { users } = (await request.json()) as { users: User[] };

        if (!Array.isArray(users)) {
            return NextResponse.json({ error: 'Invalid users data' }, { status: 400 });
        }

        connection = await getPosDb();
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
                            ? 'UPDATE users SET name = $1, role = $2, reference = $3 WHERE id = $4'
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
                            ? 'SELECT id FROM users WHERE reference = $1 LIMIT 1'
                            : 'SELECT id FROM users WHERE reference = ? LIMIT 1',
                        [providedReference]
                    );
                    const existingId = (findRows as { id: number }[])[0]?.id;
                    if (existingId) {
                        await db.execute(
                            db.isPostgreSQL
                                ? 'UPDATE users SET name = $1, role = $2, reference = $3 WHERE id = $4'
                                : 'UPDATE users SET name = ?, role = ?, reference = ? WHERE id = ?',
                            [name, role, providedReference, existingId]
                        );
                        savedIds.push(existingId);
                        continue;
                    }
                }

                const newId = await executeInsert(
                    db,
                    'INSERT INTO users (name, role, reference) VALUES ($1, $2, $3) RETURNING id',
                    'INSERT INTO users (name, role, reference) VALUES (?, ?, ?)',
                    [name, role, providedReference]
                );

                if (newId) {
                    savedIds.push(newId);
                    // Derive a unique, valid EAN-13 reference from the new id when none was provided.
                    if (!providedReference) {
                        await db.execute(
                            db.isPostgreSQL
                                ? 'UPDATE users SET reference = $1 WHERE id = $2'
                                : 'UPDATE users SET reference = ? WHERE id = ?',
                            [generateProductReference(newId), newId]
                        );
                    }
                }
            }

            // Delete users that are not in the incoming list
            if (savedIds.length > 0) {
                const placeholders = savedIds.map((_, i) => (db.isPostgreSQL ? `$${i + 1}` : '?')).join(',');
                await db.execute(`DELETE FROM users WHERE id NOT IN (${placeholders})`, savedIds);
            } else {
                // No incoming users, delete all users
                await db.execute('DELETE FROM users');
            }

            const [savedRows] = await db.execute('SELECT id, name, role, reference FROM users ORDER BY name');
            return (savedRows as { id: number; name: string; role: string; reference?: string }[]).map((row) => ({
                id: Number(row.id),
                name: row.name,
                role: row.role,
                reference: row.reference,
            }));
        });

        return NextResponse.json({ success: true, users: savedUsers }, { status: 200 });
    } catch (error) {
        console.error('Error updating users:', error);
        return NextResponse.json({ error: 'An error occurred while updating users' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
