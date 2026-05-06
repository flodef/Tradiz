/**
 * Shared database connection utilities for migration scripts
 */

import { Pool, PoolConfig } from 'pg';

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m',
};

export function log(message: string, color: keyof typeof colors = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Validate required environment variables
 */
export function validateEnv(requiredVars: string[]): void {
    const missing = requiredVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
        log(`❌ ERROR: Missing required environment variables: ${missing.join(', ')}`, 'red');
        log('Please add them to your .env.local file', 'yellow');
        process.exit(1);
    }
}

/**
 * Create a PostgreSQL connection pool configuration
 */
export function createPoolConfig(database?: string): PoolConfig {
    validateEnv(['PG_HOST', 'PG_USER', 'PG_PASSWORD']);

    return {
        host: process.env.PG_HOST,
        port: parseInt(process.env.PG_PORT || '5432'),
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: database || process.env.NEXT_PUBLIC_SHOP_ID || 'postgres',
        ssl: { rejectUnauthorized: false },
    };
}

/**
 * Create a PostgreSQL connection pool
 */
export function createPool(database?: string): Pool {
    return new Pool(createPoolConfig(database));
}
