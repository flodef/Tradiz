import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface DeviceRow {
    id: number;
    label: string;
    public_key: string;
    user_id: number | null;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const connection = await getPosDb(shopId);

        const result = await connection.execute(
            connection.isPostgreSQL
                ? 'SELECT id, label, public_key, user_id FROM dc_pos.devices ORDER BY label'
                : 'SELECT id, label, public_key, user_id FROM devices ORDER BY label'
        );
        const rows = result[0] as DeviceRow[];

        await connection.end();

        const devices = rows.map((row) => ({
            id: Number(row.id),
            label: String(row.label),
            key: String(row.public_key),
            userId: row.user_id ? Number(row.user_id) : undefined,
        }));

        return NextResponse.json({ devices });
    } catch (error) {
        console.error('Error fetching devices:', error);
        return NextResponse.json({ error: 'An error occurred while fetching devices' }, { status: 500 });
    }
}
