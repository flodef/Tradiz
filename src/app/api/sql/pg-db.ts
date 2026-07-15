import { SHOP_ID } from '@/app/constants/shop';
import { Client } from 'pg';

function buildConnectionString(): string {
    const host = process.env.PG_HOST;
    const user = process.env.PG_USER;
    const password = process.env.PG_PASSWORD;
    const database = SHOP_ID || process.env.PG_DATABASE;
    return `postgresql://${user}:${password}@${host}/${database}?sslmode=verify-full`;
}

// Each call creates a fresh pg TCP client so the wrapper can use real BEGIN/COMMIT transactions
export function getMainPgDb(): Client {
    return new Client({ connectionString: buildConnectionString() });
}

export function getPosPgDb(): Client {
    return new Client({ connectionString: buildConnectionString() });
}

// Helper to check if PostgreSQL is configured
export function isPgConfigured(): boolean {
    const hasDatabase = !!(SHOP_ID || process.env.PG_DATABASE);
    return !!(process.env.PG_HOST && process.env.PG_USER && process.env.PG_PASSWORD && hasDatabase);
}
