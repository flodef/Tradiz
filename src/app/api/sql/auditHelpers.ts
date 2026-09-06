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

function generateEventHash(event: AuditEventInput, previousHash: string | null, createdAt: string): string {
    const data = [
        previousHash || '',
        event.event_type,
        event.entity_type || 'transaction',
        event.entity_id || '',
        event.user_name,
        event.device_id || '',
        event.detail || '',
        createdAt,
    ].join('|');
    return createHash('sha256').update(data).digest('hex');
}

export async function insertAuditEvent(connection: DbConnection, event: AuditEventInput): Promise<void> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    const previousHash = await getLatestEventHash(connection);

    // Generate the timestamp now so the hash matches the stored value exactly.
    // Format: 'YYYY-MM-DD HH:MI:SS' — same format used by verifyIntegrity when
    // reading back with to_char / DATE_FORMAT.
    const now = new Date();
    const createdAt = isPg
        ? now.toISOString().substring(0, 19).replace('T', ' ')
        : now.toISOString().substring(0, 19).replace('T', ' ');

    const eventHash = generateEventHash(event, previousHash, createdAt);

    const query = isPg
        ? `INSERT INTO ${prefix}audit_events (event_type, entity_type, entity_id, user_name, device_id, detail, event_hash, previous_event_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
        : `INSERT INTO ${prefix}audit_events (event_type, entity_type, entity_id, user_name, device_id, detail, event_hash, previous_event_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await connection.execute(query, [
        event.event_type,
        event.entity_type || 'transaction',
        event.entity_id ?? null,
        event.user_name,
        event.device_id ?? null,
        event.detail ?? null,
        eventHash,
        previousHash,
        createdAt,
    ]);
}
