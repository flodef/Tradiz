import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface User {
    key?: string;
    name: string;
    role: string;
}

export async function POST(request: Request) {
    try {
        const { users } = (await request.json()) as { users: User[] };

        if (!Array.isArray(users)) {
            return NextResponse.json({ error: 'Invalid users data' }, { status: 400 });
        }

        const connection = await getPosDb();

        // Delete all existing users
        const deleteQuery = connection.isPostgreSQL ? 'DELETE FROM users' : 'DELETE FROM users';
        await connection.execute(deleteQuery);

        // Insert new users
        for (const user of users) {
            const key = user.key || user.name.toLowerCase().replace(/\s+/g, '_');
            const name = user.name;
            const role = user.role || 'Cashier';

            if (connection.isPostgreSQL) {
                const insertQuery = `
                    INSERT INTO users ("key", name, role)
                    VALUES ($1, $2, $3)
                `;
                await connection.execute(insertQuery, [key, name, role]);
            } else {
                const insertQuery = `
                    INSERT INTO users (\`key\`, name, role)
                    VALUES (?, ?, ?)
                `;
                await connection.execute(insertQuery, [key, name, role]);
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating users:', error);
        return NextResponse.json({ error: 'An error occurred while updating users' }, { status: 500 });
    }
}
