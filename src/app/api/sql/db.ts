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
// Neon HTTP is stateless — each execute() batches SET search_path + query in one sql.transaction() call.
class PostgreSQLConnectionWrapper implements DbConnection {
    isPostgreSQL = true;

    constructor(private sql: NeonHttpClient) {}

    private async runQuery(query: string, params: unknown[] = []): Promise<unknown[]> {
        // Neon HTTP is stateless — always batch SET search_path with the query
        // sql.transaction() returns an array of raw row arrays: [setPathRows, queryRows]
        const [, rows] = await this.sql.transaction([
            this.sql.query('SET search_path TO dc_pos, dc, dc_sys, public'),
            this.sql.query(query, params),
        ]);
        return (rows as unknown as unknown[]) ?? [];
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
        // No-op: Neon HTTP has no persistent session; each sql.transaction() is already atomic
    }

    async commit(): Promise<void> {
        // No-op: see beginTransaction
    }

    async rollback(): Promise<void> {
        // No-op: see beginTransaction
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
