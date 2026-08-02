import { DC, DC_POS, USE_DIGICARTE } from '@/app/utils/constants';
import mysql from 'mysql2/promise';
import { PoolClient } from 'pg';
import { getMainPgDb, getPosPgDb, isPgConfigured } from './pg-db';
import {
    DEFAULT_CONNECT_TIMEOUT_MS,
    DEFAULT_QUERY_TIMEOUT_MS,
    withRetry,
    withTimeout,
    type RetryOptions,
} from './retry';

// Unified database connection interface
export interface DbConnection {
    execute(query: string, params?: unknown[]): Promise<[unknown[], unknown]>;
    query(query: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
    end(): Promise<void>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    isPostgreSQL: boolean;
}

// Shortens a query to a readable label for timeout/retry logs.
function queryLabel(query: string): string {
    const flat = query.replace(/\s+/g, ' ').trim();
    return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

// Wrapper for MySQL connection to match our interface
class MySQLConnectionWrapper implements DbConnection {
    isPostgreSQL = false;
    private closed = false;
    private inTransaction = false;

    constructor(private connection: mysql.Connection) {}

    // Statements are retried only outside a transaction: replaying a single
    // statement of an aborted transaction would corrupt the unit of work.
    // Transactional retries are handled by withMainDb/withPosDb instead.
    private run<T>(query: string, fn: () => Promise<T>): Promise<T> {
        const label = queryLabel(query);
        if (this.inTransaction) return withTimeout(fn(), DEFAULT_QUERY_TIMEOUT_MS, label);
        return withRetry(fn, { label });
    }

    async execute(query: string, params?: unknown[]): Promise<[unknown[], unknown]> {
        return this.run(query, async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await this.connection.execute(query, params as any);
            return result as [unknown[], unknown];
        });
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

    private connected = false;
    private searchPathSet = false;
    private inTransaction = false;

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
    private async runQuery(query: string, params?: unknown[]): Promise<unknown[]> {
        const label = queryLabel(query);
        const attempt = async () => {
            await this.ensureConnected();
            await this.setSearchPath();
            const result = await this.client.query(query, params as unknown[]);
            return result.rows;
        };
        if (this.inTransaction) return withTimeout(attempt(), DEFAULT_QUERY_TIMEOUT_MS, label);
        return withRetry(attempt, { label });
    }

    async execute(query: string, params?: unknown[]): Promise<[unknown[], unknown]> {
        const rows = await this.runQuery(query, params);
        return [rows, {}];
    }

    async query(query: string, params?: unknown[]): Promise<{ rows: unknown[] }> {
        const rows = await this.runQuery(query, params);
        return { rows };
    }

    async beginTransaction(): Promise<void> {
        await this.ensureConnected();
        await this.setSearchPath();
        await withTimeout(this.client.query('BEGIN'), DEFAULT_QUERY_TIMEOUT_MS, 'BEGIN');
        this.inTransaction = true;
    }

    async commit(): Promise<void> {
        try {
            await withTimeout(this.client.query('COMMIT'), DEFAULT_QUERY_TIMEOUT_MS, 'COMMIT');
        } finally {
            this.inTransaction = false;
        }
    }

    async rollback(): Promise<void> {
        try {
            await withTimeout(this.client.query('ROLLBACK'), DEFAULT_QUERY_TIMEOUT_MS, 'ROLLBACK');
        } catch (error) {
            // A rollback on a broken connection is expected; the server already
            // discarded the transaction. Swallow so the original error surfaces.
            console.warn('[db] rollback failed:', error instanceof Error ? error.message : String(error));
        } finally {
            this.inTransaction = false;
        }
    }

    async end(): Promise<void> {
        if (this.connected) {
            // Destroy rather than reuse a client whose transaction never closed,
            // otherwise the next borrower inherits an aborted transaction.
            this.client.release(this.inTransaction || undefined);
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
            return new PostgreSQLConnectionWrapper(await getMainPgDb(shopId));
        }

        // Otherwise use MariaDB
        const connection = await mysql.createConnection({
            ...dbConfig,
            database: DC,
        });
        return new MySQLConnectionWrapper(connection);
    }, CONNECT_RETRY);
}

export async function getPosDb(shopId?: string): Promise<DbConnection> {
    return withRetry(async () => {
        // If USE_DIGICARTE is false and PostgreSQL is configured, use PostgreSQL
        if (!USE_DIGICARTE && isPgConfigured(shopId)) {
            return new PostgreSQLConnectionWrapper(await getPosPgDb(shopId));
        }

        // Otherwise use MariaDB
        const connection = await mysql.createConnection({
            ...dbConfig,
            database: DC_POS,
        });
        return new MySQLConnectionWrapper(connection);
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
