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
// Single queries go directly over HTTP (one round-trip, no handshake).
// Transactions are buffered and flushed as a single HTTP batch on COMMIT.
class PostgreSQLConnectionWrapper implements DbConnection {
    isPostgreSQL = true;
    private txStatements: Array<{ query: string; params: unknown[] }> = [];
    private inTransaction = false;

    constructor(private sql: NeonHttpClient) {}

    private async runQuery(query: string, params: unknown[] = []): Promise<unknown[]> {
        const withPath = `SET search_path TO dc_pos, dc, dc_sys, public; ${query}`;
        const rows = await this.sql.query(withPath, params);
        return Array.isArray(rows) ? rows : [];
    }

    async execute(query: string, params?: unknown[]): Promise<[unknown[], unknown]> {
        if (this.inTransaction) {
            this.txStatements.push({ query, params: params ?? [] });
            return [[], {}];
        }
        const rows = await this.runQuery(query, params);
        return [rows, {}];
    }

    async query(query: string, params?: unknown[]): Promise<{ rows: unknown[] }> {
        if (this.inTransaction) {
            this.txStatements.push({ query, params: params ?? [] });
            return { rows: [] };
        }
        const rows = await this.runQuery(query, params);
        return { rows };
    }

    async beginTransaction(): Promise<void> {
        this.inTransaction = true;
        this.txStatements = [{ query: 'SET search_path TO dc_pos, dc, dc_sys, public', params: [] }];
    }

    async commit(): Promise<void> {
        if (!this.inTransaction) return;
        const statements = this.txStatements;
        this.txStatements = [];
        this.inTransaction = false;
        await this.sql.transaction(statements.map(({ query, params }) => this.sql.query(query, params)));
    }

    async rollback(): Promise<void> {
        this.txStatements = [];
        this.inTransaction = false;
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
