import { DC, DC_POS, USE_DIGICARTE } from '@/app/utils/constants';
import mysql from 'mysql2/promise';
import { Client } from 'pg';
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

// Wrapper for PostgreSQL client to match our DbConnection interface.
// This uses real BEGIN/COMMIT/ROLLBACK so routes that truncate and re-insert are atomic.
class PostgreSQLConnectionWrapper implements DbConnection {
    isPostgreSQL = true;

    private connected = false;
    private searchPathSet = false;

    constructor(private client: Client) {}

    private async ensureConnected(): Promise<void> {
        if (!this.connected) {
            await this.client.connect();
            this.connected = true;
        }
    }

    private async setSearchPath(): Promise<void> {
        if (!this.searchPathSet) {
            await this.client.query('SET search_path TO dc_pos, dc, dc_sys, public');
            this.searchPathSet = true;
        }
    }

    private async runQuery(query: string, params?: unknown[]): Promise<unknown[]> {
        await this.ensureConnected();
        await this.setSearchPath();
        const result = await this.client.query(query, params as unknown[]);
        return result.rows;
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
        await this.client.query('BEGIN');
    }

    async commit(): Promise<void> {
        await this.client.query('COMMIT');
    }

    async rollback(): Promise<void> {
        await this.client.query('ROLLBACK');
    }

    async end(): Promise<void> {
        if (this.connected) {
            await this.client.end();
        }
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
