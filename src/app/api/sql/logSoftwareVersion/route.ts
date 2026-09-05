import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { insertAuditEvent } from '../auditHelpers';
import { getSoftwareVersion, getSoftwareName } from '@/app/utils/version';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const version = getSoftwareVersion();
        const name = getSoftwareName();
        if (!version) {
            return NextResponse.json({ error: 'Could not read version' }, { status: 500 });
        }

        connection = await getPosDb(shopId);
        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';

        // Check if the last software_update event matches this version
        const [rows] = await connection.execute(
            `SELECT detail FROM ${prefix}audit_events WHERE event_type = 'software_update' ORDER BY id DESC LIMIT 1`
        );
        const lastDetail = (rows as { detail: string | null }[])[0]?.detail ?? null;

        if (lastDetail === `version=${version}`) {
            return NextResponse.json({ logged: false, version, reason: 'already_logged' });
        }

        const { deviceId } = (await request.json().catch(() => ({}))) as { deviceId?: string };

        await connection.beginTransaction();
        await insertAuditEvent(connection, {
            event_type: 'software_update',
            entity_type: 'software',
            entity_id: name || 'tradiz',
            user_name: 'system',
            device_id: deviceId ?? null,
            detail: `version=${version}`,
        });
        await connection.commit();

        return NextResponse.json({ logged: true, version, previous: lastDetail });
    } catch (error) {
        await connection?.rollback();
        console.error('Error logging software version:', error);
        return NextResponse.json({ error: 'Failed to log software version' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
