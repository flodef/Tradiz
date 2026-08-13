import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

interface PaymentMethodRow {
    label: string;
    address: string;
    currency: string;
    available: number | boolean | null;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);

        const query = connection.isPostgreSQL
            ? `
            SELECT label, address, currency, available
            FROM dc_pos.payment_methods
        `
            : `
            SELECT label, address, currency, available
            FROM payment_methods
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const paymentMethods = (rows as PaymentMethodRow[]).map((row) => ({
            type: String(row.label),
            id: String(row.address),
            currency: String(row.currency),
            availability: Boolean(row.available ?? true),
        }));

        return NextResponse.json({ paymentMethods }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
