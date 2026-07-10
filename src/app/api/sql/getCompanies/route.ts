import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface CompanyRow {
    id: number;
    name: string;
    quota_share: number;
}

// Detects "relation/table does not exist" errors across Postgres (42P01) and MySQL/MariaDB (1146)
function isMissingTableError(error: unknown): boolean {
    const e = error as { code?: string; errno?: number };
    return e?.code === '42P01' || e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146;
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
        // If companies table doesn't exist, return empty result instead of error
        if (isMissingTableError(error)) {
            console.warn('Companies table does not exist, returning empty result');
            return NextResponse.json({ values: [['id', 'name', 'quotaShare']] });
        }
        console.error('Error fetching companies:', error);
        return NextResponse.json({ error: 'An error occurred while fetching companies' }, { status: 500 });
    }
}
