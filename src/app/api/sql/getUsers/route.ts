import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export async function GET() {
    try {
        const connection = await getPosDb();

        const query = `
            SELECT \`key\`, name, role
            FROM users
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const data: { values: (string | number)[][] } = { values: [] };
        data.values.push(['Clé', 'Nom', 'Rôle']);
        data.values.push(
            ...(rows as any[]).map((row): (string | number)[] => [String(row.key), String(row.name), String(row.role)])
        );

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
