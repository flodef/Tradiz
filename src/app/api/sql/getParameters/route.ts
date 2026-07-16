import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface ParameterRow {
    param_key: string;
    param_value: string;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const connection = await getPosDb(shopId);

        const query = `
            SELECT param_key, param_value
            FROM parameters
            ORDER BY id
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const parameters = (rows as ParameterRow[]).map((row) => ({
            key: String(row.param_key),
            value: String(row.param_value),
        }));

        return NextResponse.json({ parameters }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
