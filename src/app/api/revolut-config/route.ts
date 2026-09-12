import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ configured: !!process.env.REVOLUT_SECRET_KEY });
}
