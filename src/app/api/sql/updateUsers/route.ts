import { NextResponse } from 'next/server';
import { getPosDb } from '../db';
import { generateProductReference } from '@/app/utils/productReference';

interface User {
    id?: number;
    name: string;
    role: string;
    reference?: string;
}

export async function POST(request: Request) {
    try {
        const { users } = (await request.json()) as { users: User[] };

        if (!Array.isArray(users)) {
            return NextResponse.json({ error: 'Invalid users data' }, { status: 400 });
        }

        const connection = await getPosDb();

        // Upsert users and collect their final ids
        const savedIds: number[] = [];
        for (const user of users) {
            const name = user.name;
            const role = user.role || 'Cashier';
            const reference = user.reference || generateProductReference(Date.now());

            if (user.id) {
                // Update existing user by id
                const updateQuery = connection.isPostgreSQL
                    ? 'UPDATE users SET name = $1, role = $2, reference = $3 WHERE id = $4'
                    : 'UPDATE users SET name = ?, role = ?, reference = ? WHERE id = ?';
                await connection.execute(updateQuery, [name, role, reference, user.id]);
                savedIds.push(user.id);
            } else {
                // Try to find an existing user by reference
                const findQuery = connection.isPostgreSQL
                    ? 'SELECT id FROM users WHERE reference = $1 LIMIT 1'
                    : 'SELECT id FROM users WHERE reference = ? LIMIT 1';
                const [findRows] = await connection.execute(findQuery, [reference]);
                const existingId = (findRows as { id: number }[])[0]?.id;

                if (existingId) {
                    const updateQuery = connection.isPostgreSQL
                        ? 'UPDATE users SET name = $1, role = $2 WHERE id = $3'
                        : 'UPDATE users SET name = ?, role = ? WHERE id = ?';
                    await connection.execute(updateQuery, [name, role, existingId]);
                    savedIds.push(existingId);
                } else {
                    const insertQuery = connection.isPostgreSQL
                        ? 'INSERT INTO users (name, role, reference) VALUES ($1, $2, $3) RETURNING id'
                        : 'INSERT INTO users (name, role, reference) VALUES (?, ?, ?)';
                    const [insertResult] = await connection.execute(insertQuery, [name, role, reference]);

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

        // Delete users that are not in the incoming list
        if (savedIds.length > 0) {
            const placeholders = savedIds.map((_, i) => (connection.isPostgreSQL ? `$${i + 1}` : '?')).join(',');
            const deleteQuery = `DELETE FROM users WHERE id NOT IN (${placeholders})`;
            await connection.execute(deleteQuery, savedIds);
        } else {
            // No incoming users, delete all users
            await connection.execute('DELETE FROM users');
        }

        const selectQuery = connection.isPostgreSQL
            ? 'SELECT id, name, role, reference FROM users ORDER BY name'
            : 'SELECT id, name, role, reference FROM users ORDER BY name';
        const [savedRows] = await connection.execute(selectQuery);
        const savedUsers = (savedRows as { id: number; name: string; role: string; reference?: string }[]).map(
            (row) => ({
                id: Number(row.id),
                name: row.name,
                role: row.role,
                reference: row.reference,
            })
        );

        await connection.end();

        return NextResponse.json({ success: true, users: savedUsers }, { status: 200 });
    } catch (error) {
        console.error('Error updating users:', error);
        return NextResponse.json({ error: 'An error occurred while updating users' }, { status: 500 });
    }
}
