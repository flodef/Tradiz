import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

export const dynamic = 'force-dynamic';

interface DeviceRow {
    id: number;
    label: string;
    public_key: string;
    user_id: number | null;
    backscreen_com: string | null;
    backscreen_baud: number | null;
    printer_com: string | null;
    printer_baud: number | null;
    cash_drawer_com: string | null;
    cash_drawer_baud: number | null;
}

export async function GET(request: Request) {
    // Restrict to localhost — this route exposes device hardware config (COM ports)
    // and is only called by the Electron main process or the app itself.
    const forwarded = request.headers.get('x-forwarded-for');
    const origin = forwarded?.split(',')[0]?.trim() || '127.0.0.1';
    if (origin !== '127.0.0.1' && origin !== '::1' && origin !== '::ffff:127.0.0.1') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);

        const result = await connection.execute(
            connection.isPostgreSQL
                ? 'SELECT id, label, public_key, user_id, backscreen_com, backscreen_baud, printer_com, printer_baud, cash_drawer_com, cash_drawer_baud FROM dc_pos.devices ORDER BY label'
                : 'SELECT id, label, public_key, user_id, backscreen_com, backscreen_baud, printer_com, printer_baud, cash_drawer_com, cash_drawer_baud FROM devices ORDER BY label'
        );
        const rows = result[0] as DeviceRow[];

        await connection.end();

        const devices = rows.map((row) => ({
            id: Number(row.id),
            label: String(row.label),
            key: String(row.public_key),
            userId: row.user_id ? Number(row.user_id) : undefined,
            backscreenCom: row.backscreen_com ?? null,
            backscreenBaud: row.backscreen_baud ?? null,
            printerCom: row.printer_com ?? null,
            printerBaud: row.printer_baud ?? null,
            cashDrawerCom: row.cash_drawer_com ?? null,
            cashDrawerBaud: row.cash_drawer_baud ?? null,
        }));

        return NextResponse.json({ devices });
    } catch (error) {
        console.error('Error fetching devices:', error);
        return NextResponse.json({ error: 'An error occurred while fetching devices' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
