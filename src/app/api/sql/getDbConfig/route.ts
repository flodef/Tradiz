import { NextResponse } from 'next/server';

export async function GET() {
    // Check for MariaDB config (used when USE_DIGICARTE = true)
    const hasMariaDbConfig = !!(
        process.env.DB_HOST?.trim() &&
        process.env.DB_USER?.trim() &&
        process.env.DB_PASSWORD?.trim()
    );

    // Check for PostgreSQL config (used when USE_DIGICARTE = false)
    const hasPostgresConfig = !!(
        process.env.PG_HOST?.trim() &&
        process.env.PG_USER?.trim() &&
        process.env.PG_PASSWORD?.trim() &&
        (process.env.NEXT_PUBLIC_SHOP_ID?.trim() || process.env.PG_DATABASE?.trim())
    );

    // If USE_DIGICARTE is true, prefer MariaDB, otherwise prefer PostgreSQL
    const useDigicarte = process.env.NEXT_PUBLIC_USE_DIGICARTE?.toLowerCase() === 'true';
    const hasDbConfig = useDigicarte ? hasMariaDbConfig : hasPostgresConfig;

    return NextResponse.json({ hasDbConfig });
}
