import { getShopIdFromRequest } from '@/app/constants/shop';
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

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const connection = await getPosDb(shopId);

        const query = connection.isPostgreSQL
            ? `SELECT c.id, c.first_name, c.last_name, c.reference, c.email, c.phone, c.company, co.quota_share
               FROM dc_pos.customers c
               LEFT JOIN dc_pos.companies co ON c.company = co.name
               ORDER BY c.last_name, c.first_name`
            : `SELECT c.id, c.first_name, c.last_name, c.reference, c.email, c.phone, c.company, co.quota_share
               FROM customers c
               LEFT JOIN companies co ON c.company = co.name
               ORDER BY c.last_name, c.first_name`;

        const result = await connection.execute(query);
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
