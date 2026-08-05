import { NextResponse } from 'next/server';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET() {
    const ports: number[] = [];
    for (let i = 1; i <= 16; i++) {
        try {
            const fd = fs.openSync(`\\\\.\\COM${i}`, 'r');
            fs.closeSync(fd);
            ports.push(i);
        } catch {
            // Port not available
        }
    }
    return NextResponse.json({ ports });
}
