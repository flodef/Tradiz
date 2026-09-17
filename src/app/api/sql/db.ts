import { DC, DC_POS, USE_DIGICARTE } from '@/app/utils/constants';
import mysql from 'mysql2/promise';
import { PoolClient } from 'pg';
import { getMainPgDb, getPosPgDb, isPgConfigured } from './pg-db';
import {
    DEFAULT_CONNECT_TIMEOUT_MS,
    DEFAULT_QUERY_TIMEOUT_MS,
    isBrokenSocketError,
    isRetryableDbError,
    withRetry,
    withTimeout,
    type RetryOptions,
} from './retry';

// Unified database connection interface
export interface DbConnection {
    // `timeoutMs` overrides the per-statement watchdog — needed by calls whose
    // server-side wait is intentionally longer than the default (e.g.
    // GET_LOCK/pg_advisory_lock with a 30 s bound).
    execute(query: string, params?: unknown[], timeoutMs?: number): Promise<[unknown[], unknown]>;
    query(query: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
    end(): Promise<void>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    // Whether the connection is currently inside an explicit transaction —
    // pg_advisory_xact_lock only protects work while this is true.
    isInTransaction(): boolean;
    isPostgreSQL: boolean;
    // Shop the connection points at — set by getMainDb/getPosDb so per-shop
    // caches can key on it without threading shopId through every caller.
    shopId?: string;
}

// Sargable half-open day range [date, nextDay): keeps a created_at index
// usable, unlike DATE(created_at) which forces a full-table scan per query.
export function dayBounds(date: string): [string, string] {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid day for range bounds: ${date}`);
    const next = new Date(Date.parse(`${date}T00:00:00Z`) + 24 * 60 * 60 * 1000);
    return [date, next.toISOString().slice(0, 10)];
}

// Shortens a query to a readable label for timeout/retry logs.
function queryLabel(query: string): string {
    const flat = query.replace(/\s+/g, ' ').trim();
    return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

// Wrapper for MySQL connection to match our interface
class MySQLConnectionWrapper implements DbConnection {
    isPostgreSQL = false;
    shopId?: string;
    private closed = false;
    private inTransaction = false;

    isInTransaction(): boolean {
        return this.inTransaction;
    }

    constructor(private connection: mysql.Connection) {}

    // Statements are retried only outside a transaction: replaying a single
    // statement of an aborted transaction would corrupt the unit of work.
    // Transactional retries are handled by withMainDb/withPosDb instead.
    private run<T>(query: string, fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
        const label = queryLabel(query);
        if (this.inTransaction) return withTimeout(fn(), timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS, label);
        return withRetry(fn, { label, timeoutMs });
    }

    async execute(query: string, params?: unknown[], timeoutMs?: number): Promise<[unknown[], unknown]> {
        return this.run(
            query,
            async () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await this.connection.execute(query, params as any);
                return result as [unknown[], unknown];
            },
            timeoutMs
        );
    }

    async query(query: string, params?: unknown[]): Promise<{ rows: unknown[] }> {
        return this.run(query, async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const [rows] = await this.connection.execute(query, params as any);
            return { rows: rows as unknown[] };
        });
    }

    async beginTransaction(): Promise<void> {
        await withTimeout(this.connection.beginTransaction(), DEFAULT_QUERY_TIMEOUT_MS, 'BEGIN');
        this.inTransaction = true;
    }

    async commit(): Promise<void> {
        try {
            await withTimeout(this.connection.commit(), DEFAULT_QUERY_TIMEOUT_MS, 'COMMIT');
        } finally {
            this.inTransaction = false;
        }
    }

    async rollback(): Promise<void> {
        try {
            await withTimeout(this.connection.rollback(), DEFAULT_QUERY_TIMEOUT_MS, 'ROLLBACK');
        } catch (error) {
            // A rollback on a dead connection is expected; the server already
            // discarded the transaction. Swallow so the original error surfaces.
            console.warn('[db] rollback failed:', error instanceof Error ? error.message : String(error));
        } finally {
            this.inTransaction = false;
        }
    }

    async end(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        this.inTransaction = false;
        await this.connection.end().catch(() => {});
    }
}

// Wrapper for PostgreSQL client to match our DbConnection interface.
// This uses real BEGIN/COMMIT/ROLLBACK so routes that truncate and re-insert are atomic.
class PostgreSQLConnectionWrapper implements DbConnection {
    isPostgreSQL = true;
    shopId?: string;

    private connected = false;
    private searchPathSet = false;
    private inTransaction = false;
    // Session-scoped advisory locks (pg_advisory_lock) outlive the caller's
    // queries — if a lock-holder times out mid-flight the client could be
    // released to the pool still holding it, silently serializing the next
    // borrower. Tracked here so end() can release it explicitly.
    private holdsAdvisoryLock = false;
    // Set on transport-level failures (timeout, socket error): such a socket
    // is untrusted — it may be half-dead with a still-pending query, so end()
    // must destroy the client instead of recycling it. Without this, one
    // network blip turns the whole pool into zombies that each new request
    // borrows, times out on, and returns as "healthy" — every route then
    // fails for good. Plain SQL errors leave it unset: the server answered,
    // so the connection is healthy.
    private broken = false;
    private brokenCause?: string;

    isInTransaction(): boolean {
        return this.inTransaction;
    }

    constructor(private client: PoolClient) {
        // Pool clients are already connected when handed to the wrapper.
        this.connected = true;
    }

    private async ensureConnected(): Promise<void> {
        // Pool clients are already connected; nothing to do.
        return;
    }

    private async setSearchPath(): Promise<void> {
        if (!this.searchPathSet) {
            await withTimeout(
                this.client.query('SET search_path TO dc_pos, dc, dc_sys, public'),
                DEFAULT_QUERY_TIMEOUT_MS,
                'SET search_path'
            );
            this.searchPathSet = true;
        }
    }

    // Statements are retried only outside a transaction: once Postgres aborts a
    // transaction every further statement fails with 25P02, so replaying one is
    // pointless. Transactional retries are handled by withMainDb/withPosDb.
    private async runQuery(
        query: string,
        params?: unknown[],
        timeoutMs?: number
    ): Promise<{ rows: unknown[]; rowCount: number | null }> {
        const label = queryLabel(query);
        const attempt = async () => {
            if (this.broken) {
                // The socket already failed — a dead TCP connection cannot
                // recover, so retrying on it just burns another 15 s watchdog
                // per attempt. Throw a non-retryable error instead.
                const error = new Error(`Connection is broken (after: ${this.brokenCause ?? 'previous failure'})`);
                (error as { code?: string }).code = 'ECONNBROKEN';
                throw error;
            }
            try {
                await this.ensureConnected();
                await this.setSearchPath();
                const result = await this.client.query(query, params as unknown[]);
                return { rows: result.rows, rowCount: result.rowCount };
            } catch (error) {
                if (isBrokenSocketError(error)) {
                    this.broken = true;
                    this.brokenCause = error instanceof Error ? error.message : String(error);
                }
                throw error;
            }
        };
        if (this.inTransaction) {
            try {
                return await withTimeout(attempt(), timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS, label);
            } catch (error) {
                if (isBrokenSocketError(error)) {
                    this.broken = true;
                    this.brokenCause = error instanceof Error ? error.message : String(error);
                }
                throw error;
            }
        }
        return withRetry(attempt, {
            label,
            timeoutMs,
            shouldRetry: (error) => {
                // The watchdog fires outside attempt()'s catch, so a hung
                // socket would otherwise be retried on (15 s × attempts) and
                // released as healthy — the zombie pool. Any broken-socket
                // error marks the client for destruction and stops retrying:
                // a dead socket cannot recover, the next request needs a
                // fresh client. Server-answered errors (deadlock…) still
                // retry on this healthy connection.
                if (isBrokenSocketError(error)) {
                    this.broken = true;
                    this.brokenCause = error instanceof Error ? error.message : String(error);
                    return false;
                }
                return isRetryableDbError(error);
            },
        });
    }

    async execute(query: string, params?: unknown[], timeoutMs?: number): Promise<[unknown[], unknown]> {
        // Track session-scoped advisory locks — unlock statements contain
        // 'unlock'. The flag flips only after the statement succeeds: a
        // failed unlock must leave it set so end() can still run
        // pg_advisory_unlock_all.
        const isUnlock = query.includes('advisory_unlock');
        const isLock = !isUnlock && query.includes('advisory_lock');
        const { rows, rowCount } = await this.runQuery(query, params, timeoutMs);
        if (isUnlock) this.holdsAdvisoryLock = false;
        else if (isLock) this.holdsAdvisoryLock = true;
        // Mirror mysql2's ResultSetHeader so callers read affectedRows on both
        // drivers without branching — a missing rowCount read as 0 looks
        // exactly like "no row matched" and caused the heartbeat
        // registered:false regression.
        return [rows, { affectedRows: rowCount ?? 0 }];
    }

    async query(query: string, params?: unknown[]): Promise<{ rows: unknown[] }> {
        const { rows } = await this.runQuery(query, params);
        return { rows };
    }

    async beginTransaction(): Promise<void> {
        try {
            await this.ensureConnected();
            await this.setSearchPath();
            await withTimeout(this.client.query('BEGIN'), DEFAULT_QUERY_TIMEOUT_MS, 'BEGIN');
            this.inTransaction = true;
        } catch (error) {
            if (isBrokenSocketError(error)) this.broken = true;
            throw error;
        }
    }

    async commit(): Promise<void> {
        try {
            await withTimeout(this.client.query('COMMIT'), DEFAULT_QUERY_TIMEOUT_MS, 'COMMIT');
        } catch (error) {
            // A timed-out COMMIT may leave a pending query or an open
            // transaction — the client must not go back to the pool.
            if (isBrokenSocketError(error)) this.broken = true;
            throw error;
        } finally {
            this.inTransaction = false;
        }
    }

    async rollback(): Promise<void> {
        try {
            await withTimeout(this.client.query('ROLLBACK'), DEFAULT_QUERY_TIMEOUT_MS, 'ROLLBACK');
        } catch (error) {
            if (isBrokenSocketError(error)) this.broken = true;
            // A rollback on a broken connection is expected; the server already
            // discarded the transaction. Swallow so the original error surfaces.
            console.warn('[db] rollback failed:', error instanceof Error ? error.message : String(error));
        } finally {
            this.inTransaction = false;
        }
    }

    async end(): Promise<void> {
        if (this.connected) {
            // Same reasoning as inTransaction: a client holding a session
            // advisory lock must not go back to the pool.
            if (this.holdsAdvisoryLock) {
                await this.client.query('SELECT pg_advisory_unlock_all()').catch(() => {});
                this.holdsAdvisoryLock = false;
            }
            // Destroy rather than reuse a client whose transaction never closed
            // or whose socket failed — otherwise the next borrower inherits an
            // aborted transaction or a zombie that hangs for 15 s per query.
            this.client.release(this.broken || this.inTransaction ? new Error('broken client') : undefined);
            this.connected = false;
            this.searchPathSet = false;
            this.inTransaction = false;
        }
    }
}

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
};

// Acquiring a connection is itself flaky (cold starts, exhausted pools), so it
// gets its own retry with a shorter watchdog than a regular query.
const CONNECT_RETRY: RetryOptions = { timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS, label: 'connect' };

export async function getMainDb(shopId?: string): Promise<DbConnection> {
    return withRetry(async () => {
        // If USE_DIGICARTE is false and PostgreSQL is configured, use PostgreSQL
        if (!USE_DIGICARTE && isPgConfigured(shopId)) {
            const wrapper = new PostgreSQLConnectionWrapper(await getMainPgDb(shopId));
            wrapper.shopId = shopId;
            return wrapper;
        }

        // Otherwise use MariaDB
        const connection = await mysql.createConnection({
            ...dbConfig,
            database: DC,
        });
        const wrapper = new MySQLConnectionWrapper(connection);
        wrapper.shopId = shopId;
        return wrapper;
    }, CONNECT_RETRY);
}

export async function getPosDb(shopId?: string): Promise<DbConnection> {
    return withRetry(async () => {
        // If USE_DIGICARTE is false and PostgreSQL is configured, use PostgreSQL
        if (!USE_DIGICARTE && isPgConfigured(shopId)) {
            const wrapper = new PostgreSQLConnectionWrapper(await getPosPgDb(shopId));
            wrapper.shopId = shopId;
            return wrapper;
        }

        // Otherwise use MariaDB
        const connection = await mysql.createConnection({
            ...dbConfig,
            database: DC_POS,
        });
        const wrapper = new MySQLConnectionWrapper(connection);
        wrapper.shopId = shopId;
        return wrapper;
    }, CONNECT_RETRY);
}

// Runs `fn` against a freshly acquired connection and always releases it, even
// on error. On a transient failure the whole callback is replayed on a brand new
// connection: this is the only safe place to retry work that spans a transaction,
// because the failed attempt was already rolled back and the connection discarded.
async function withDb<T>(
    acquire: (shopId?: string) => Promise<DbConnection>,
    shopId: string | undefined,
    fn: (connection: DbConnection) => Promise<T>,
    label: string
): Promise<T> {
    return withRetry(
        async () => {
            const connection = await acquire(shopId);
            try {
                return await fn(connection);
            } finally {
                await connection.end();
            }
        },
        // The inner statements already retried on their own; only replay the whole
        // unit of work once more when the connection itself died mid-flight.
        // No watchdog here: each statement is individually timed out already.
        { label, timeoutMs: 0, maxAttempts: 2 }
    );
}

// Acquire a POS connection, run the callback, and always release the connection
// (even on error). Prevents pool exhaustion when a query throws before end() is reached.
export async function withPosDb<T>(
    shopId: string | undefined,
    fn: (connection: DbConnection) => Promise<T>
): Promise<T> {
    return withDb(getPosDb, shopId, fn, 'withPosDb');
}

// Same as withPosDb but for the main (DC) database.
export async function withMainDb<T>(
    shopId: string | undefined,
    fn: (connection: DbConnection) => Promise<T>
): Promise<T> {
    return withDb(getMainDb, shopId, fn, 'withMainDb');
}

// Run a set of statements inside a real transaction, rolling back on any error.
export async function withTransaction<T>(connection: DbConnection, fn: () => Promise<T>): Promise<T> {
    await connection.beginTransaction();
    try {
        const result = await fn();
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}

// Re-exported so routes can classify errors without importing ./retry directly.
export { isRetryableDbError, DbTimeoutError } from './retry';

// Run an INSERT and return the generated primary key id, handling both drivers.
// The PostgreSQL query must include a `RETURNING id` clause.
export async function executeInsert(
    connection: DbConnection,
    pgQuery: string,
    myQuery: string,
    params: unknown[]
): Promise<number | undefined> {
    const [result] = await connection.execute(connection.isPostgreSQL ? pgQuery : myQuery, params);
    if (connection.isPostgreSQL) {
        return (result as { id: number }[])[0]?.id;
    }
    const insertId = Number((result as unknown as { insertId: number }).insertId);
    return Number.isNaN(insertId) ? undefined : insertId;
}

// Legacy type export for backwards compatibility
export type Connection = DbConnection;
