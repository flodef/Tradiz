import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

export const dynamic = 'force-dynamic';

interface DeviceHardwareRow {
    id: number;
    backscreen_com: string | null;
    backscreen_baud: number | null;
    printer_com: string | null;
    printer_baud: number | null;
    cash_drawer_com: string | null;
    cash_drawer_baud: number | null;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const publicKey = request.headers.get('x-public-key') || new URL(request.url).searchParams.get('publicKey');
        if (!publicKey) {
            return NextResponse.json({ error: 'Public key is required' }, { status: 400 });
        }

        connection = await getPosDb(shopId);

        const result = await connection.execute(
            connection.isPostgreSQL
                ? 'SELECT id, backscreen_com, backscreen_baud, printer_com, printer_baud, cash_drawer_com, cash_drawer_baud FROM dc_pos.devices WHERE public_key = $1 LIMIT 1'
                : 'SELECT id, backscreen_com, backscreen_baud, printer_com, printer_baud, cash_drawer_com, cash_drawer_baud FROM devices WHERE public_key = ? LIMIT 1',
            [publicKey]
        );
        const rows = result[0] as DeviceHardwareRow[];

        if (!rows.length) {
            return NextResponse.json({ error: 'Device not found' }, { status: 404 });
        }

        const row = rows[0];
        return NextResponse.json({
            deviceId: Number(row.id),
            backscreenCom: row.backscreen_com ?? null,
            backscreenBaud: row.backscreen_baud ?? null,
            printerCom: row.printer_com ?? null,
            printerBaud: row.printer_baud ?? null,
            cashDrawerCom: row.cash_drawer_com ?? null,
            cashDrawerBaud: row.cash_drawer_baud ?? null,
        });
    } catch (error) {
        console.error('Error fetching device hardware:', error);
        return NextResponse.json({ error: 'An error occurred while fetching device hardware' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
