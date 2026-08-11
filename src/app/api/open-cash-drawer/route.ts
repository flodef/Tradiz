import { NextResponse } from 'next/server';
import { openCashDrawer } from '@/app/utils/posPrinter';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const { printerAddress } = await request.json();
        if (!printerAddress) {
            return NextResponse.json({ error: 'Printer address is required' }, { status: 400 });
        }

        const result = await openCashDrawer(printerAddress);
        if ('error' in result) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Cash drawer API error:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
