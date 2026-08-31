import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

export const dynamic = 'force-dynamic';

interface CompanyRow {
    id: number;
    name: string;
    employer_share: number;
    siret: string | null;
    vat_number: string | null;
    address: string | null;
    zip_code: string | null;
    city: string | null;
}

// Detects "relation/table does not exist" errors across Postgres (42P01) and MySQL/MariaDB (1146)
function isMissingTableError(error: unknown): boolean {
    const e = error as { code?: string; errno?: number };
    return e?.code === '42P01' || e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);

        const query = connection.isPostgreSQL
            ? 'SELECT id, name, employer_share, siret, vat_number, address, zip_code, city FROM dc_pos.companies ORDER BY name'
            : 'SELECT id, name, employer_share, siret, vat_number, address, zip_code, city FROM companies ORDER BY name';

        const result = await connection.execute(query);
        const rows = result[0] as CompanyRow[];

        await connection.end();

        const companies = rows.map((row) => ({
            id: row.id,
            name: String(row.name),
            employerShare: Number(row.employer_share ?? 0),
            ...(row.siret ? { siret: String(row.siret) } : {}),
            ...(row.vat_number ? { vatNumber: String(row.vat_number) } : {}),
            ...(row.address ? { address: String(row.address) } : {}),
            ...(row.zip_code ? { zipCode: String(row.zip_code) } : {}),
            ...(row.city ? { city: String(row.city) } : {}),
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
    } finally {
        await connection?.end();
    }
}
