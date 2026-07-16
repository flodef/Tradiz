import { Client } from 'pg';

function buildConnectionString(shopId?: string): string {
    const host = process.env.PG_HOST;
    const user = process.env.PG_USER;
    const password = process.env.PG_PASSWORD;
    const database = shopId || process.env.PG_DATABASE;
    return `postgresql://${user}:${password}@${host}/${database}?sslmode=verify-full`;
}

// Each call creates a fresh pg TCP client so the wrapper can use real BEGIN/COMMIT transactions
export function getMainPgDb(shopId?: string): Client {
    return new Client({ connectionString: buildConnectionString(shopId) });
}

export function getPosPgDb(shopId?: string): Client {
    return new Client({ connectionString: buildConnectionString(shopId) });
}

// Helper to check if PostgreSQL is configured
export function isPgConfigured(shopId?: string): boolean {
    const hasDatabase = !!(shopId || process.env.PG_DATABASE);
    return !!(process.env.PG_HOST && process.env.PG_USER && process.env.PG_PASSWORD && hasDatabase);
}
