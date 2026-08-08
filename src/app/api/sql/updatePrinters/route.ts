import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

interface PrinterInput {
    label: string;
    ipAddress: string;
}

interface UpdatePrintersRequest {
    printers: PrinterInput[];
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { printers } = (await request.json()) as UpdatePrintersRequest;

        if (!Array.isArray(printers)) {
            return NextResponse.json({ error: 'Invalid printers data' }, { status: 400 });
        }

        connection = await getPosDb(shopId);

        // Delete all existing printers and re-insert
        if (connection.isPostgreSQL) {
            await connection.execute('DELETE FROM dc_pos.printers');
            for (const printer of printers) {
                await connection.execute('INSERT INTO dc_pos.printers (name, ip_address) VALUES ($1, $2)', [
                    printer.label,
                    printer.ipAddress,
                ]);
            }
        } else {
            await connection.execute('DELETE FROM printers');
            for (const printer of printers) {
                await connection.execute('INSERT INTO printers (name, ip_address) VALUES (?, ?)', [
                    printer.label,
                    printer.ipAddress,
                ]);
            }
        }

        await connection.end();
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating printers:', error);
        return NextResponse.json({ error: 'An error occurred while updating printers' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
