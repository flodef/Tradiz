import { NextResponse } from 'next/server';
import { getPosDb } from '../db';
import { generateProductReference } from '@/app/utils/productReference';

interface User {
    key?: string;
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

        // Delete all existing users
        const deleteQuery = connection.isPostgreSQL ? 'DELETE FROM users' : 'DELETE FROM users';
        await connection.execute(deleteQuery);

        // Insert new users
        for (const user of users) {
            const key = user.key || user.name.toLowerCase().replace(/\s+/g, '_');
            const name = user.name;
            const role = user.role || 'Cashier';
            // Auto-generate reference if not provided
            const reference = user.reference || generateProductReference(Date.now());

            if (connection.isPostgreSQL) {
                const insertQuery = `
                    INSERT INTO users ("key", name, role, reference)
                    VALUES ($1, $2, $3, $4)
                `;
                await connection.execute(insertQuery, [key, name, role, reference]);
            } else {
                const insertQuery = `
                    INSERT INTO users (\`key\`, name, role, reference)
                    VALUES (?, ?, ?, ?)
                `;
                await connection.execute(insertQuery, [key, name, role, reference]);
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating users:', error);
        return NextResponse.json({ error: 'An error occurred while updating users' }, { status: 500 });
    }
}
