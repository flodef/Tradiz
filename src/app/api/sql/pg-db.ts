import { Pool } from 'pg';

// PostgreSQL connection pool for Neon
let mainPool: Pool | null = null;
let posPool: Pool | null = null;

const pgConfig = {
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    ssl: { rejectUnauthorized: false }, // Required for Neon
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

export function getMainPgDb() {
    if (!mainPool) {
        mainPool = new Pool(pgConfig);
    }
    return mainPool;
}

export function getPosPgDb() {
    if (!posPool) {
        posPool = new Pool(pgConfig);
    }
    return posPool;
}

// Helper to check if PostgreSQL is configured
export function isPgConfigured(): boolean {
    return !!(
        process.env.PG_HOST &&
        process.env.PG_USER &&
        process.env.PG_PASSWORD &&
        process.env.PG_DATABASE
    );
}
