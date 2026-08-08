import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

interface PrinterRow {
    name: string;
    ip_address: string;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);

        const query = connection.isPostgreSQL
            ? `SELECT name, ip_address FROM dc_pos.printers`
            : `SELECT name, ip_address FROM printers`;

        const [rows] = await connection.execute(query);
        await connection.end();

        const printers = (rows as PrinterRow[]).map((row) => ({
            label: String(row.name),
            ipAddress: String(row.ip_address),
        }));

        return NextResponse.json({ printers }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
