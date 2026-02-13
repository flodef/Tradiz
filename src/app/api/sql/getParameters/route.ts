import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface ParameterRow {
    param_key: string;
    param_value: string;
}

export async function GET() {
    try {
        const connection = await getPosDb();

        const query = `
            SELECT param_key, param_value
            FROM parameters
            ORDER BY id
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const data: { values: string[][] } = { values: [] };
        data.values.push(
            ...(rows as ParameterRow[]).map((row): string[] => [String(row.param_key), String(row.param_value)])
        );

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
