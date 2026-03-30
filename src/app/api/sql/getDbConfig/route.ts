import { NextResponse } from 'next/server';

export async function GET() {
    const hasDbConfig = !!(
        process.env.DB_HOST?.trim() &&
        process.env.DB_USER?.trim() &&
        process.env.DB_PASSWORD?.trim() &&
        process.env.DB_NAME?.trim()
    );

    return NextResponse.json({ hasDbConfig });
}
