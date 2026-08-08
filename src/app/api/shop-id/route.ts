import { NextResponse } from 'next/server';
import { getShopIdFromHostname } from '@/app/constants/shop';

export async function GET(request: Request) {
    const hostname = request.headers.get('host') || '';
    const shopId = getShopIdFromHostname(hostname);
    return NextResponse.json({ shopId }, { status: 200 });
}
