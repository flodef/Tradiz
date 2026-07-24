import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface CompanyRow {
    id: number;
    name: string;
    meal_price: number;
}

// Detects "relation/table does not exist" errors across Postgres (42P01) and MySQL/MariaDB (1146)
function isMissingTableError(error: unknown): boolean {
    const e = error as { code?: string; errno?: number };
    return e?.code === '42P01' || e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const connection = await getPosDb(shopId);

        const query = connection.isPostgreSQL
            ? 'SELECT id, name, meal_price FROM dc_pos.companies ORDER BY name'
            : 'SELECT id, name, meal_price FROM companies ORDER BY name';

        const result = await connection.execute(query);
        const rows = result[0] as CompanyRow[];

        await connection.end();

        const companies = rows.map((row) => ({
            id: row.id,
            name: String(row.name),
            mealPrice: Number(row.meal_price ?? 0),
        }));

        return NextResponse.json({ companies });
    } catch (error) {
        // If companies table doesn't exist, return empty result instead of error
        if (isMissingTableError(error)) {
            console.warn('Companies table does not exist, returning empty result');
            return NextResponse.json({ companies: [] });
        }
        console.error('Error fetching companies:', error);
        return NextResponse.json({ error: 'An error occurred while fetching companies' }, { status: 500 });
    }
}
