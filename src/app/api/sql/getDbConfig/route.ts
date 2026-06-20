import { NextResponse } from 'next/server';

export interface DbConfigEnv {
    DB_HOST?: string;
    DB_USER?: string;
    DB_PASSWORD?: string;
    DB_NAME?: string;
    PG_HOST?: string;
    PG_USER?: string;
    PG_PASSWORD?: string;
    PG_DATABASE?: string;
    NEXT_PUBLIC_SHOP_ID?: string;
    NEXT_PUBLIC_USE_DIGICARTE?: string;
}

/**
 * Compute whether DB is configured based on environment variables.
 * Exported for testing purposes.
 */
export function computeHasDbConfig(env: DbConfigEnv): boolean {
    // Check for MariaDB config (used when USE_DIGICARTE = true)
    const hasMariaDbConfig = !!(env.DB_HOST?.trim() && env.DB_USER?.trim() && env.DB_PASSWORD?.trim());

    // Check for PostgreSQL config (used when USE_DIGICARTE = false)
    const hasPostgresConfig = !!(
        env.PG_HOST?.trim() &&
        env.PG_USER?.trim() &&
        env.PG_PASSWORD?.trim() &&
        (env.NEXT_PUBLIC_SHOP_ID?.trim() || env.PG_DATABASE?.trim())
    );

    // If USE_DIGICARTE is true, prefer MariaDB, otherwise prefer PostgreSQL
    const useDigicarte = env.NEXT_PUBLIC_USE_DIGICARTE?.toLowerCase() === 'true';
    return useDigicarte ? hasMariaDbConfig : hasPostgresConfig;
}

export async function GET() {
    // Log environment variables for debugging
    console.log('[getDbConfig] Environment check:', {
        PG_HOST: process.env.PG_HOST ? 'SET' : 'NOT SET',
        PG_USER: process.env.PG_USER ? 'SET' : 'NOT SET',
        PG_PASSWORD: process.env.PG_PASSWORD ? 'SET' : 'NOT SET',
        NEXT_PUBLIC_SHOP_ID: process.env.NEXT_PUBLIC_SHOP_ID ? 'SET' : 'NOT SET',
        PG_DATABASE: process.env.PG_DATABASE ? 'SET' : 'NOT SET',
        NEXT_PUBLIC_USE_DIGICARTE: process.env.NEXT_PUBLIC_USE_DIGICARTE,
    });

    const hasDbConfig = computeHasDbConfig(process.env as DbConfigEnv);
    console.log('[getDbConfig] hasDbConfig:', hasDbConfig);
    return NextResponse.json({ hasDbConfig });
}
