import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface PaymentMethodRow {
    label: string;
    address: string;
    currency: string;
    hidden: number | null;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const connection = await getPosDb(shopId);

        const query = connection.isPostgreSQL
            ? `
            SELECT label, address, currency, hidden
            FROM dc_pos.payment_methods
        `
            : `
            SELECT label, address, currency, hidden
            FROM payment_methods
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const paymentMethods = (rows as PaymentMethodRow[]).map((row) => ({
            type: String(row.label),
            id: String(row.address),
            currency: String(row.currency),
            availability: Number(row.hidden ?? 0) !== 1,
        }));

        return NextResponse.json({ paymentMethods }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
