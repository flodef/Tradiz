import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

export async function GET() {
    try {
        const connection = await getMainDb();
        const [rows] = await connection.execute(
            'SELECT mode_fonctionnement FROM config_etablissement ORDER BY id DESC LIMIT 1'
        );
        await connection.end();

        const row = (rows as any[])[0];
        return NextResponse.json(
            { mode_fonctionnement: row?.mode_fonctionnement ?? 'restaurant' },
            { status: 200 }
        );
    } catch (error) {
        console.error('getEtabConfig error:', error);
        return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
    }
}
