import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

interface AuditEventInput {
    event_type: string;
    entity_type?: string;
    entity_id?: string | null;
    user_name: string;
    device_id?: string | null;
    detail?: string | null;
}

interface AuditEventRow {
    id: number;
    event_hash: string | null;
}

async function getLatestEventHash(connection: DbConnection): Promise<string | null> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = `SELECT event_hash FROM ${prefix}audit_events ORDER BY id DESC LIMIT 1`;
    const [rows] = await connection.execute(query);
    const result = (rows as { event_hash: string | null }[])[0];
    return result?.event_hash ?? null;
}

function generateEventHash(event: AuditEventInput, previousHash: string | null): string {
    const data = [
        previousHash || '',
        event.event_type,
        event.entity_type || 'transaction',
        event.entity_id || '',
        event.user_name,
        event.device_id || '',
        event.detail || '',
    ].join('|');
    return createHash('sha256').update(data).digest('hex');
}

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
        const insertedIds: number[] = [];

        for (const event of events) {
            if (!event.event_type || !event.user_name) continue;

            const previousHash = await getLatestEventHash(connection);
            const eventHash = generateEventHash(event, previousHash);
            const isPg = connection.isPostgreSQL;
            const prefix = isPg ? 'dc_pos.' : '';

            const query = isPg
                ? `INSERT INTO ${prefix}audit_events (event_type, entity_type, entity_id, user_name, device_id, detail, event_hash, previous_event_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`
                : `INSERT INTO ${prefix}audit_events (event_type, entity_type, entity_id, user_name, device_id, detail, event_hash, previous_event_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

            const params = [
                event.event_type,
                event.entity_type || 'transaction',
                event.entity_id ?? null,
                event.user_name,
                event.device_id ?? null,
                event.detail ?? null,
                eventHash,
                previousHash,
            ];

            if (isPg) {
                const [rows] = await connection.execute(query, params);
                insertedIds.push((rows as AuditEventRow[])[0].id);
            } else {
                await connection.execute(query, params);
                const [rows] = await connection.execute('SELECT LAST_INSERT_ID() as id');
                insertedIds.push((rows as AuditEventRow[])[0].id);
            }
        }

        return NextResponse.json({ success: true, count: insertedIds.length, ids: insertedIds }, { status: 200 });
    } catch (error) {
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
