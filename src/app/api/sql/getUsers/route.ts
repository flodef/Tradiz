import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface UserRow {
    key: string;
    name: string;
    role: string;
    reference: string | null;
}

export async function GET() {
    try {
        const connection = await getPosDb();

        const query = connection.isPostgreSQL
            ? 'SELECT "key", name, role, reference FROM users ORDER BY name'
            : 'SELECT `key`, name, role, reference FROM users ORDER BY name';

        const result = await connection.execute(query);
        const rows = result[0] as UserRow[];

        await connection.end();

        const users = rows.map((row) => ({
            key: String(row.key),
            name: String(row.name),
            role: String(row.role),
            reference: row.reference ? String(row.reference) : undefined,
        }));

        return NextResponse.json({ users });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'An error occurred while fetching users' }, { status: 500 });
    }
}
