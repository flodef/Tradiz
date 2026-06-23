import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface UserRow {
    key: string;
    name: string;
    role: string;
}

export async function GET() {
    try {
        const connection = await getPosDb();

        const query = connection.isPostgreSQL
            ? 'SELECT "key", name, role FROM users ORDER BY name'
            : 'SELECT `key`, name, role FROM users ORDER BY name';

        const result = await connection.execute(query);
        const rows = result[0] as UserRow[];

        await connection.end();

        // Format as values array with header row
        const values = [['key', 'name', 'role'], ...rows.map((row: UserRow) => [row.key, row.name, row.role])];

        return NextResponse.json({ values });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'An error occurred while fetching users' }, { status: 500 });
    }
}
