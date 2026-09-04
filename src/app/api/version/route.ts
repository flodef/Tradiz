import { NextResponse } from 'next/server';
import { getSoftwareVersion } from '@/app/utils/version';

export async function GET() {
    const version = getSoftwareVersion();
    if (!version) {
        return NextResponse.json({ error: 'Failed to read version' }, { status: 500 });
    }
    return NextResponse.json({ version });
}
