import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export async function GET() {
    try {
        const connection = await getPosDb();

        const query = `
            SELECT name, ip_address
            FROM printers
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const data: { values: string[][] } = { values: [] };
        data.values.push(['Nom', 'Adresse IP']);
        data.values.push(...(rows as any[]).map((row): string[] => [String(row.name), String(row.ip_address)]));

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
