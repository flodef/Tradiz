import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { insertAuditEvent, type AuditEventInput } from '../auditHelpers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const body = (await request.json()) as AuditEventInput | AuditEventInput[];
        const events = Array.isArray(body) ? body : [body];

        if (events.length === 0) {
            return NextResponse.json({ error: 'No events provided' }, { status: 400 });
        }

        connection = await getPosDb(shopId);
        await connection.beginTransaction();

        let insertedCount = 0;
        for (const event of events) {
            if (!event.event_type || !event.user_name) continue;
            await insertAuditEvent(connection, event);
            insertedCount++;
        }

        await connection.commit();

        return NextResponse.json({ success: true, count: insertedCount }, { status: 200 });
    } catch (error) {
        await connection?.rollback();
        console.error('Error saving audit events:', error);
        return NextResponse.json({ error: 'An error occurred while saving audit events' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { searchParams } = new URL(request.url);
        const entityType = searchParams.get('entity_type');
        const entityId = searchParams.get('entity_id');
        const eventType = searchParams.get('event_type');
        const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 1000);

        connection = await getPosDb(shopId);
        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';

        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (entityType) {
            conditions.push(isPg ? `entity_type = $${paramIdx}` : `entity_type = ?`);
            params.push(entityType);
            paramIdx++;
        }
        if (entityId) {
            conditions.push(isPg ? `entity_id = $${paramIdx}` : `entity_id = ?`);
            params.push(entityId);
            paramIdx++;
        }
        if (eventType) {
            conditions.push(isPg ? `event_type = $${paramIdx}` : `event_type = ?`);
            params.push(eventType);
            paramIdx++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limitClause = isPg ? `LIMIT $${paramIdx}` : `LIMIT ?`;
        params.push(limit);

        const query = `SELECT id, event_type, entity_type, entity_id, user_name, device_id, detail, event_hash, previous_event_hash, created_at FROM ${prefix}audit_events ${whereClause} ORDER BY id DESC ${limitClause}`;
        const [rows] = await connection.execute(query, params);

        return NextResponse.json({ events: rows }, { status: 200 });
    } catch (error) {
        console.error('Error fetching audit events:', error);
        return NextResponse.json({ error: 'An error occurred while fetching audit events' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
