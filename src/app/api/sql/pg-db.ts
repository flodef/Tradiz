import { Pool, neonConfig } from '@neondatabase/serverless';

// Use fetch for HTTP-based queries (no TCP cold start on Neon serverless)
if (typeof WebSocket === 'undefined') {
    // Node.js environment: use ws for WebSocket (needed for transactions)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    neonConfig.webSocketConstructor = require('ws');
}

// Neon Pool instances (lazily created, reused across requests)
let mainPool: Pool | null = null;
let posPool: Pool | null = null;

function buildConnectionString(): string {
    const host = process.env.PG_HOST;
    const user = process.env.PG_USER;
    const password = process.env.PG_PASSWORD;
    const database = process.env.NEXT_PUBLIC_SHOP_ID || process.env.PG_DATABASE;
    return `postgresql://${user}:${password}@${host}/${database}?sslmode=require`;
}

export function getMainPgDb(): Pool {
    if (!mainPool) mainPool = new Pool({ connectionString: buildConnectionString() });
    return mainPool;
}

export function getPosPgDb(): Pool {
    if (!posPool) posPool = new Pool({ connectionString: buildConnectionString() });
    return posPool;
}

// Helper to check if PostgreSQL is configured
export function isPgConfigured(): boolean {
    const hasDatabase = !!(process.env.NEXT_PUBLIC_SHOP_ID || process.env.PG_DATABASE);
    return !!(process.env.PG_HOST && process.env.PG_USER && process.env.PG_PASSWORD && hasDatabase);
}
