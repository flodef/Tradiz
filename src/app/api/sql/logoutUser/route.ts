import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';
import { assertDeviceAuthorized, sessionTokenFromRequest, sessionTokenHash } from '../deviceAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sql/logoutUser — revokes the caller's user session (token in
 * the `x-user-token` header). Called when switching away from a
 * PIN-protected user so the previous session stops granting its role.
 */
export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    const deviceGuard = await assertDeviceAuthorized(request, shopId);
    if (deviceGuard) return deviceGuard;

    const token = sessionTokenFromRequest(request);
    if (!token) return NextResponse.json({ ok: true });

    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);
        await connection.execute(
            connection.isPostgreSQL
                ? `UPDATE dc_pos.sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`
                : `UPDATE sessions SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL`,
            [sessionTokenHash(token)]
        );
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Error revoking user session:', error);
        return NextResponse.json({ ok: true });
    } finally {
        await connection?.end();
    }
}
