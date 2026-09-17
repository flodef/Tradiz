import { createHash } from 'crypto';
import { DbTimeoutError, type DbConnection } from './db';

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

/**
 * Serialize writers appending to a hash chain. Reading the tail hash then
 * inserting is a read-then-write race: two concurrent writers read the same
 * tail and fork the chain, which verifyIntegrity then reports as a break.
 *
 * Returns an unlock function — always call it (try/finally). On PostgreSQL
 * the lock is TRANSACTION-scoped (pg_advisory_xact_lock): the caller MUST be
 * inside a transaction, and the server releases it at COMMIT/ROLLBACK — so
 * unlike session-scoped pg_advisory_lock it can never leak onto a pooled
 * backend when a client dies mid-hold (observed behind pgbouncer: one
 * orphaned session lock wedged every hash-chain writer). On MariaDB the lock
 * is session-scoped (GET_LOCK) and released on disconnect.
 */
export async function lockHashChain(
    connection: DbConnection,
    name: string,
    timeoutMs = 10_000
): Promise<() => Promise<void>> {
    if (connection.isPostgreSQL) {
        // Fail loudly rather than take a lock that releases at statement end
        // and serializes nothing.
        if (!connection.isInTransaction()) {
            throw new Error(`Hash chain lock "${name}" requires an open transaction`);
        }
        // One blocking wait bounded client-side by the per-call watchdog — no
        // pg_try_advisory_lock polling (each poll was a remote round trip,
        // burning ~60-120 of them during a contended 30 s closure). On
        // timeout the watchdog marks the socket broken and end() destroys it;
        // the aborted transaction releases any pending lock server-side.
        try {
            await connection.execute('SELECT pg_advisory_xact_lock(hashtext($1))', [name], timeoutMs);
        } catch (error) {
            if (error instanceof DbTimeoutError) {
                throw new Error(`Could not acquire hash chain lock "${name}" (timeout)`, { cause: error });
            }
            throw error;
        }
        // Released server-side at COMMIT/ROLLBACK — callers unlock adjacent to
        // their transaction end anyway, so no explicit unlock is needed.
        return async () => {};
    }
    // GET_LOCK waits server-side (whole seconds); the client watchdog gets a
    // margin so the NULL result wins the race instead of a socket-killing
    // watchdog timeout.
    const [rows] = await connection.execute(
        'SELECT GET_LOCK(?, ?) AS got',
        [name, Math.ceil(timeoutMs / 1000)],
        timeoutMs + 5_000
    );
    const got = (rows as { got: number | string | null }[])[0]?.got;
    if (Number(got) !== 1) throw new Error(`Could not acquire hash chain lock "${name}" (timeout)`);
    return async () => {
        await connection.execute('SELECT RELEASE_LOCK(?)', [name]);
    };
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

    // The hash-chain lock is transaction-scoped on PG — own a transaction
    // when the caller didn't open one so the lock spans the read+insert.
    const ownTx = isPg && !connection.isInTransaction();
    if (ownTx) await connection.beginTransaction();

    const unlock = await lockHashChain(connection, 'nf525_audit_events');
    try {
        const previousHash = await getLatestEventHash(connection);

        // Generate the timestamp now so the hash matches the stored value exactly.
        // Format: 'YYYY-MM-DD HH:MI:SS' — same format used by verifyIntegrity when
        // reading back with to_char / DATE_FORMAT.
        const now = new Date();
        const createdAt = now.toISOString().substring(0, 19).replace('T', ' ');

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
        if (ownTx) await connection.commit();
    } catch (error) {
        if (ownTx) await connection.rollback();
        throw error;
    } finally {
        await unlock();
    }
}
