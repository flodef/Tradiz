import { DC, DC_POS, USE_DIGICARTE } from '@/app/utils/constants';
import mysql from 'mysql2/promise';
import { Pool as PgPool } from 'pg';
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

// Wrapper for PostgreSQL pool to match our interface
class PostgreSQLConnectionWrapper implements DbConnection {
    isPostgreSQL = true;

    constructor(private pool: PgPool) {}

    async execute(query: string, params?: unknown[]): Promise<[unknown[], unknown]> {
        // Set search path before each query (Neon doesn't support it in connection options)
        await this.pool.query('SET search_path TO dc_pos, dc, dc_sys, public');
        const result = await this.pool.query(query, params);
        return [result.rows, {}];
    }

    async query(query: string, params?: unknown[]): Promise<{ rows: unknown[] }> {
        // Set search path before each query (Neon doesn't support it in connection options)
        await this.pool.query('SET search_path TO dc_pos, dc, dc_sys, public');
        const result = await this.pool.query(query, params);
        return { rows: result.rows };
    }

    async beginTransaction(): Promise<void> {
        await this.pool.query('BEGIN');
    }

    async commit(): Promise<void> {
        await this.pool.query('COMMIT');
    }

    async rollback(): Promise<void> {
        await this.pool.query('ROLLBACK');
    }

    async end(): Promise<void> {
        // For PostgreSQL pool, we don't end it (it's reused)
        // Just return immediately
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
