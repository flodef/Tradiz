import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface CustomerRow {
    id: number;
    first_name: string;
    last_name: string;
    reference: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    quota_share: number | null;
}

// Detects "relation/table does not exist" errors across Postgres (42P01) and MySQL/MariaDB (1146)
function isMissingTableError(error: unknown): boolean {
    const e = error as { code?: string; errno?: number };
    return e?.code === '42P01' || e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146;
}

export async function GET() {
    try {
        const connection = await getPosDb();

        // Try query with companies join first
        let query = connection.isPostgreSQL
            ? `SELECT c.id, c.first_name, c.last_name, c.reference, c.email, c.phone, c.company, co.quota_share
               FROM dc_pos.customers c
               LEFT JOIN dc_pos.companies co ON c.company = co.name
               ORDER BY c.last_name, c.first_name`
            : `SELECT c.id, c.first_name, c.last_name, c.reference, c.email, c.phone, c.company, co.quota_share
               FROM customers c
               LEFT JOIN companies co ON c.company = co.name
               ORDER BY c.last_name, c.first_name`;

        let result;
        try {
            result = await connection.execute(query);
        } catch (joinError) {
            // Only fall back to a join-less query if the companies table is missing;
            // rethrow any other error so genuine failures aren't masked.
            if (!isMissingTableError(joinError)) throw joinError;
            console.warn('Companies table does not exist, using fallback query');
            query = connection.isPostgreSQL
                ? `SELECT c.id, c.first_name, c.last_name, c.reference, c.email, c.phone, c.company, NULL as quota_share
                   FROM dc_pos.customers c
                   ORDER BY c.last_name, c.first_name`
                : `SELECT c.id, c.first_name, c.last_name, c.reference, c.email, c.phone, c.company, NULL as quota_share
                   FROM customers c
                   ORDER BY c.last_name, c.first_name`;
            result = await connection.execute(query);
        }

        const rows = result[0] as CustomerRow[];

        await connection.end();

        const customers = rows.map((row) => ({
            id: row.id,
            firstName: String(row.first_name),
            lastName: String(row.last_name),
            reference: row.reference ?? undefined,
            email: row.email ?? undefined,
            phone: row.phone ?? undefined,
            company: row.company ?? undefined,
            quotaShare: row.quota_share ?? undefined,
        }));

        return NextResponse.json({ customers });
    } catch (error) {
        console.error('Error fetching customers:', error);
        return NextResponse.json({ error: 'An error occurred while fetching customers' }, { status: 500 });
    }
}
