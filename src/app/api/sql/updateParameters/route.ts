import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface ParameterUpdate {
    key: string;
    value: string;
}

export async function POST(request: Request) {
    try {
        const { parameters } = await request.json();

        if (!parameters || !Array.isArray(parameters)) {
            return NextResponse.json({ error: 'Invalid parameters format' }, { status: 400 });
        }

        const connection = await getPosDb();

        // Update each parameter
        for (const param of parameters as ParameterUpdate[]) {
            const query = `
                INSERT INTO parameters (param_key, param_value)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE param_value = VALUES(param_value)
            `;
            await connection.execute(query, [param.key, param.value]);
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating parameters' }, { status: 500 });
    }
}
