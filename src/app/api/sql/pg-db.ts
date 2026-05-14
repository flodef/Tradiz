import { neon } from '@neondatabase/serverless';

function buildConnectionString(): string {
    const host = process.env.PG_HOST;
    const user = process.env.PG_USER;
    const password = process.env.PG_PASSWORD;
    const database = process.env.NEXT_PUBLIC_SHOP_ID || process.env.PG_DATABASE;
    return `postgresql://${user}:${password}@${host}/${database}?sslmode=require`;
}

// Each call creates a fresh neon HTTP client — no persistent connection, no cold-start penalty
export function getMainPgDb() {
    return neon(buildConnectionString());
}

export function getPosPgDb() {
    return neon(buildConnectionString());
}

// Helper to check if PostgreSQL is configured
export function isPgConfigured(): boolean {
    const hasDatabase = !!(process.env.NEXT_PUBLIC_SHOP_ID || process.env.PG_DATABASE);
    return !!(process.env.PG_HOST && process.env.PG_USER && process.env.PG_PASSWORD && hasDatabase);
}
