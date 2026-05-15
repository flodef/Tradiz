import { DC, DC_POS, USE_DIGICARTE } from '@/app/utils/constants';
import mysql from 'mysql2/promise';
import { getMainPgDb, getPosPgDb, isPgConfigured } from './pg-db';

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

// Wrapper for MySQL connection to match our interface
class MySQLConnectionWrapper implements DbConnection {
    isPostgreSQL = false;

    constructor(private connection: mysql.Connection) {}

    async execute(query: string, params?: unknown[]): Promise<[unknown[], unknown]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await this.connection.execute(query, params as any);
        return result as [unknown[], unknown];
    }

    async query(query: string, params?: unknown[]): Promise<{ rows: unknown[] }> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [rows] = await this.connection.execute(query, params as any);
        return { rows: rows as unknown[] };
    }

    async beginTransaction(): Promise<void> {
        await this.connection.beginTransaction();
    }

    async commit(): Promise<void> {
        await this.connection.commit();
    }

    async rollback(): Promise<void> {
        await this.connection.rollback();
    }

    async end(): Promise<void> {
        await this.connection.end();
    }
}

type NeonHttpClient = ReturnType<typeof import('./pg-db').getMainPgDb>;

// Wrapper for Neon HTTP client to match our DbConnection interface.
// Outside a transaction: SET search_path + query are batched in one sql.transaction() call.
// Inside a transaction (after BEGIN): queries run directly via sql.query() — no nested transaction.
class PostgreSQLConnectionWrapper implements DbConnection {
    isPostgreSQL = true;
    private inTransaction = false;

    constructor(private sql: NeonHttpClient) {}

    private async runQuery(query: string, params: unknown[] = []): Promise<unknown[]> {
        type QueryResult = { rows: unknown[] };
        if (this.inTransaction) {
            // Inside BEGIN…COMMIT: run directly, search_path already set
            // sql.query() returns a NeonQueryResult with a .rows array
            const result = (await this.sql.query(query, params)) as unknown as QueryResult;
            return result.rows ?? [];
        }
        // Outside transaction: batch search_path + query in one HTTP round-trip
        // sql.transaction() returns an array of NeonQueryResult objects
        const [, result] = (await this.sql.transaction([
            this.sql.query('SET search_path TO dc_pos, dc, dc_sys, public'),
            this.sql.query(query, params),
        ])) as unknown as QueryResult[];
        return result.rows ?? [];
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
        await this.sql.transaction([
            this.sql.query('SET search_path TO dc_pos, dc, dc_sys, public'),
            this.sql.query('BEGIN'),
        ]);
        this.inTransaction = true;
    }

    async commit(): Promise<void> {
        this.inTransaction = false;
        await this.sql.query('COMMIT');
    }

    async rollback(): Promise<void> {
        this.inTransaction = false;
        await this.sql.query('ROLLBACK');
    }

    async end(): Promise<void> {
        return Promise.resolve();
    }
}

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
};

export async function getMainDb(): Promise<DbConnection> {
    // If USE_DIGICARTE is false and PostgreSQL is configured, use PostgreSQL
    if (!USE_DIGICARTE && isPgConfigured()) {
        return new PostgreSQLConnectionWrapper(getMainPgDb());
    }

    // Otherwise use MariaDB
    const connection = await mysql.createConnection({
        ...dbConfig,
        database: DC,
    });
    return new MySQLConnectionWrapper(connection);
}

export async function getPosDb(): Promise<DbConnection> {
    // If USE_DIGICARTE is false and PostgreSQL is configured, use PostgreSQL
    if (!USE_DIGICARTE && isPgConfigured()) {
        return new PostgreSQLConnectionWrapper(getPosPgDb());
    }

    // Otherwise use MariaDB
    const connection = await mysql.createConnection({
        ...dbConfig,
        database: DC_POS,
    });
    return new MySQLConnectionWrapper(connection);
}

// Legacy type export for backwards compatibility
export type Connection = DbConnection;
