import { Pool, PoolClient } from 'pg';

function buildConnectionString(shopId?: string): string {
    const host = process.env.PG_HOST;
    const user = process.env.PG_USER;
    const password = process.env.PG_PASSWORD;
    const database = shopId || process.env.PG_DATABASE;
    return `postgresql://${encodeURIComponent(user ?? '')}:${encodeURIComponent(password ?? '')}@${host}/${encodeURIComponent(database ?? '')}?sslmode=verify-full`;
}

const pools = new Map<string, Pool>();

function getPgPool(connectionString: string): Pool {
    let pool = pools.get(connectionString);
    if (!pool) {
        pool = new Pool({
            connectionString,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        pool.on('error', (err) => console.error('PostgreSQL pool error:', err));
        pools.set(connectionString, pool);
    }
    return pool;
}

// Returns a connected client from the shared pool. Callers must release it via connection.end().
export async function getMainPgDb(shopId?: string): Promise<PoolClient> {
    return getPgPool(buildConnectionString(shopId)).connect();
}

export async function getPosPgDb(shopId?: string): Promise<PoolClient> {
    return getPgPool(buildConnectionString(shopId)).connect();
}

// Helper to check if PostgreSQL is configured
export function isPgConfigured(shopId?: string): boolean {
    const hasDatabase = !!(shopId || process.env.PG_DATABASE);
    return !!(process.env.PG_HOST && process.env.PG_USER && process.env.PG_PASSWORD && hasDatabase);
}
