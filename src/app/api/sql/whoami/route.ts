import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { resolveDeviceAuth, recordDeniedAccess, deviceKeyFromRequest } from '../deviceAuth';

export const dynamic = 'force-dynamic';

/**
 * Authorization probe: tells the caller whether its device public key is
 * registered and what it may do. Admin pages use it to decide whether they
 * may render at all. Never returns device lists or other devices' keys.
 */
export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);
        const auth = await resolveDeviceAuth(request, connection, shopId);
        if (!auth.authorized) {
            const throttled = await recordDeniedAccess(connection, request, deviceKeyFromRequest(request));
            if (throttled) return throttled;
            return NextResponse.json({ authorized: false }, { status: 403 });
        }
        return NextResponse.json(auth);
    } catch (error) {
        console.error('Error resolving device:', error);
        return NextResponse.json({ error: 'An error occurred while resolving device' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
