import { DEFAULT_USER } from '@/app/utils/constants';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export async function GET(_request: Request) {
    try {
        const connection = await getPosDb();

        const query = connection.isPostgreSQL
            ? `
            SELECT DISTINCT DATE(t.created_at) as date
            FROM transactions t
            WHERE t.user_name = $1 OR t.user_name IS NULL
            ORDER BY date DESC
        `
            : `
            SELECT DISTINCT DATE(t.created_at) as date
            FROM transactions t
            WHERE t.user_name = ? OR t.user_name IS NULL
            ORDER BY date DESC
        `;

        const [rows] = await connection.execute(query, [DEFAULT_USER]);
        const dates = (rows as { date: string }[]).map((row) => row.date);

        await connection.end();

        return NextResponse.json({ dates }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching available dates' }, { status: 500 });
    }
}
