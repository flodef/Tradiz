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
    balance: number | string;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const connection = await getPosDb(shopId);

        const query = connection.isPostgreSQL
            ? `SELECT id, first_name, last_name, reference, email, phone, company, balance
               FROM dc_pos.customers
               ORDER BY last_name, first_name`
            : `SELECT id, first_name, last_name, reference, email, phone, company, balance
               FROM customers
               ORDER BY last_name, first_name`;

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
            balance: Number(row.balance ?? 0),
        }));

        return NextResponse.json({ customers });
    } catch (error) {
        console.error('Error fetching customers:', error);
        return NextResponse.json({ error: 'An error occurred while fetching customers' }, { status: 500 });
    }
}
