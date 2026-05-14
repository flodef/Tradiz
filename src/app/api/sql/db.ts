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

// Minimal interface matching both pg.Pool and @neondatabase/serverless Pool
interface PgPoolLike {
    query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

// Wrapper for Neon/pg Pool to match our DbConnection interface
class PostgreSQLConnectionWrapper implements DbConnection {
    isPostgreSQL = true;

    constructor(private pool: PgPoolLike) {}

    async execute(query: string, params?: unknown[]): Promise<[unknown[], unknown]> {
        await this.pool.query('SET search_path TO dc_pos, dc, dc_sys, public');
        const result = await this.pool.query(query, params);
        return [result.rows, {}];
    }

    async query(query: string, params?: unknown[]): Promise<{ rows: unknown[] }> {
        await this.pool.query('SET search_path TO dc_pos, dc, dc_sys, public');
        return this.pool.query(query, params);
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
