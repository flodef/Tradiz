import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

export const dynamic = 'force-dynamic';

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

        const queryWithAvailable = connection.isPostgreSQL
            ? `SELECT label, address, currency, available FROM dc_pos.payment_methods`
            : `SELECT label, address, currency, available FROM payment_methods`;

        const queryWithHidden = connection.isPostgreSQL
            ? `SELECT label, address, currency, NOT hidden as available FROM dc_pos.payment_methods`
            : `SELECT label, address, currency, NOT hidden as available FROM payment_methods`;

        let rows: PaymentMethodRow[];
        try {
            [rows] = (await connection.execute(queryWithAvailable)) as PaymentMethodRow[][];
        } catch {
            // available column may not exist yet — fall back to hidden column
            [rows] = (await connection.execute(queryWithHidden)) as PaymentMethodRow[][];
        }
        await connection.end();

        const paymentMethods = rows.map((row) => ({
            type: String(row.label),
            // Read NULL as an empty string.
            id: row.address == null ? '' : String(row.address),
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
