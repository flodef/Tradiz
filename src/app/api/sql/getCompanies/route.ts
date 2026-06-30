import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface CompanyRow {
    id: number;
    name: string;
    quota_share: number;
}

export async function GET() {
    try {
        const connection = await getPosDb();

        const query = connection.isPostgreSQL
            ? 'SELECT id, name, quota_share FROM dc_pos.companies ORDER BY name'
            : 'SELECT id, name, quota_share FROM companies ORDER BY name';

        const result = await connection.execute(query);
        const rows = result[0] as CompanyRow[];

        await connection.end();

        // Format as values array with header row
        const values = [
            ['id', 'name', 'quotaShare'],
            ...rows.map((row: CompanyRow) => [row.id, row.name, row.quota_share]),
        ];

        return NextResponse.json({ values });
    } catch (error) {
        console.error('Error fetching companies:', error);
        return NextResponse.json({ error: 'An error occurred while fetching companies' }, { status: 500 });
    }
}
