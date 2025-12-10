import { POS } from '@/app/utils/constants';
import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME + '_' + POS,
        });

        const query = `
            SELECT key, name, role
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
