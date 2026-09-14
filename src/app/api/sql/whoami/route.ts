import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import {
    resolveDeviceAuth,
    recordDeniedAccess,
    deviceKeyFromRequest,
    resolveUserSession,
    shopRequiresUserAuth,
} from '../deviceAuth';

export const dynamic = 'force-dynamic';

/**
 * Authorization probe: tells the caller whether its device public key is
 * registered and what it may do. Admin pages use it to decide whether they
 * may render at all. Never returns device lists or other devices' keys.
 *
 * When the shop enables `requireUserAuth`, `admin` reflects the *user
 * session* role (intervention devices stay exempt), while `deviceAdmin`
 * keeps reporting the device-linked role.
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
        const requiresUserAuth = await shopRequiresUserAuth(connection);
        const session = await resolveUserSession(request, connection, auth.deviceId);
        const admin = requiresUserAuth ? auth.intervention || session?.role.toLowerCase() === 'admin' : auth.admin;
        return NextResponse.json({
            authorized: auth.authorized,
            admin,
            deviceAdmin: auth.admin,
            intervention: auth.intervention,
            role: auth.role,
            requiresUserAuth,
            session: session ? { userId: session.userId, name: session.name, role: session.role } : null,
        });
    } catch (error) {
        console.error('Error resolving device:', error);
        return NextResponse.json({ error: 'An error occurred while resolving device' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
