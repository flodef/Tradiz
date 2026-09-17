import { getShopIdFromRequest } from '@/app/constants/shop';
import { authorizeDeviceOn } from '../deviceAuth';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

export const dynamic = 'force-dynamic';

interface UserRow {
    id: number;
    name: string;
    role: string;
    reference: string | null;
    pin_hash: string | null;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);
        const auth = await authorizeDeviceOn(request, connection, shopId);
        if (auth instanceof NextResponse) return auth;

        // Users bound to an intervention device (e.g. the "Intervention"
        // support account) are only selectable from an intervention device.
        const interventionFilter = auth.intervention
            ? ''
            : connection.isPostgreSQL
              ? `WHERE NOT EXISTS (SELECT 1 FROM dc_pos.devices d WHERE d.user_id = u.id AND d.intervention)`
              : `WHERE NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.intervention = 1)`;

        const result = await connection.execute(
            connection.isPostgreSQL
                ? `SELECT u.id, u.name, u.role, u.reference, u.pin_hash FROM dc_pos.users u
                   ${interventionFilter}
                   ORDER BY u.name`
                : `SELECT u.id, u.name, u.role, u.reference, u.pin_hash FROM users u
                   ${interventionFilter}
                   ORDER BY u.name`
        );
        const rows = result[0] as UserRow[];

        await connection.end();

        const users = rows.map((row) => ({
            id: Number(row.id),
            name: String(row.name),
            role: String(row.role),
            reference: row.reference ? String(row.reference) : undefined,
            hasPin: !!row.pin_hash,
        }));

        return NextResponse.json({ users });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'An error occurred while fetching users' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
