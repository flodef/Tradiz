import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const query = `
            SELECT param_key, param_value
            FROM parameters
            ORDER BY id
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const data: { values: string[][] } = { values: [] };
        data.values.push(
            ...(rows as any[]).map((row): string[] => [
                String(row.param_key),
                String(row.param_value),
            ])
        );

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
