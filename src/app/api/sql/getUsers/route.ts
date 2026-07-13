import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface UserRow {
    id: number;
    name: string;
    role: string;
    reference: string | null;
}

export async function GET() {
    try {
        const connection = await getPosDb();

        const result = await connection.execute(
            'SELECT u.id, u.name, u.role, u.reference FROM users u ORDER BY u.name'
        );
        const rows = result[0] as UserRow[];

        await connection.end();

        const users = rows.map((row) => ({
            id: Number(row.id),
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
