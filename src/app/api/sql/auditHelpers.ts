import { createHash } from 'crypto';
import type { DbConnection } from './db';

export interface AuditEventInput {
    event_type: string;
    entity_type?: string;
    entity_id?: string | null;
    user_name: string;
    device_id?: string | null;
    detail?: string | null;
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

export async function insertAuditEvent(connection: DbConnection, event: AuditEventInput): Promise<void> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    const previousHash = await getLatestEventHash(connection);
    const eventHash = generateEventHash(event, previousHash);

    const query = isPg
        ? `INSERT INTO ${prefix}audit_events (event_type, entity_type, entity_id, user_name, device_id, detail, event_hash, previous_event_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
        : `INSERT INTO ${prefix}audit_events (event_type, entity_type, entity_id, user_name, device_id, detail, event_hash, previous_event_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    await connection.execute(query, [
        event.event_type,
        event.entity_type || 'transaction',
        event.entity_id ?? null,
        event.user_name,
        event.device_id ?? null,
        event.detail ?? null,
        eventHash,
        previousHash,
    ]);
}
