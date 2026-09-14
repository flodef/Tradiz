import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';
import { assertDeviceAuthorized, requestIp, resolveDeviceAuth, sessionTokenHash } from '../deviceAuth';
import { verifyPin } from '../pinHash';
import { generateSecureId } from '@/app/utils/id';

export const dynamic = 'force-dynamic';

// PINs are short — brute force is bounded by a per-IP failure counter kept in
// dc_sys.connections (type 'pin_attempt').
const PIN_WINDOW_MS = 15 * 60 * 1000;
const PIN_MAX_FAILURES = 5;
// Sessions cover a full working day; expiry is checked at resolve time.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface UserRow {
    pin_hash: string | null;
}

/**
 * POST /api/sql/verifyUserPin — checks a user's PIN when switching user on
 * the POS. Device-gated (any registered device) and rate-limited:
 * 5 failures / 15 min per IP → 429.
 */
export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    const deviceGuard = await assertDeviceAuthorized(request, shopId);
    if (deviceGuard) return deviceGuard;

    let connection: DbConnection | undefined;
    try {
        const body = (await request.json()) as { userId?: number; pin?: string };
        const userId = Number(body.userId);
        const pin = typeof body.pin === 'string' ? body.pin : '';
        if (!Number.isInteger(userId) || userId <= 0 || !pin) {
            return NextResponse.json({ error: 'Missing or invalid userId/pin' }, { status: 400 });
        }

        connection = await getPosDb(shopId);
        const isPg = connection.isPostgreSQL;
        const ip = requestIp(request);

        // Rate limit: 5 failures / 15 min, counted per IP *and* per target
        // user — the user_id counter also bounds on-device brute force
        // (Electron/localhost requests are exempt from IP-based limits).
        const windowStart = new Date(Date.now() - PIN_WINDOW_MS).toISOString();
        const [countRows] = await connection.execute(
            isPg
                ? `SELECT COUNT(*) AS count FROM dc_sys.connections
                   WHERE metadata->>'type' = 'pin_attempt' AND metadata->>'success' = 'false'
                   AND created_at > $1
                   AND (metadata->>'ip_address' = $2 OR metadata->>'user_id' = $3)`
                : `SELECT COUNT(*) AS count FROM connections
                   WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.type')) = 'pin_attempt'
                   AND JSON_EXTRACT(metadata, '$.success') = 'false' AND created_at > ?
                   AND (JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.ip_address')) = ?
                        OR JSON_EXTRACT(metadata, '$.user_id') = ?)`,
            isPg ? [windowStart, ip, String(userId)] : [windowStart, ip, userId]
        );
        const failures = Number((countRows as { count: number | string }[])[0]?.count) || 0;
        if (failures >= PIN_MAX_FAILURES) {
            return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
        }

        const [rows] = await connection.execute(
            isPg
                ? 'SELECT pin_hash FROM dc_pos.users WHERE id = $1 LIMIT 1'
                : 'SELECT pin_hash FROM users WHERE id = ? LIMIT 1',
            [userId]
        );
        const userRow = (rows as UserRow[])[0];

        const ok = userRow?.pin_hash ? await verifyPin(pin, userRow.pin_hash) : false;

        // Log the attempt (never the PIN itself)
        await connection
            .execute(
                isPg
                    ? `INSERT INTO dc_sys.connections (level, message, metadata) VALUES ($1, $2, $3)`
                    : `INSERT INTO connections (level, message, metadata) VALUES (?, ?, ?)`,
                [
                    ok ? 'info' : 'warn',
                    `PIN attempt for user ${userId}`,
                    JSON.stringify({ type: 'pin_attempt', ip_address: ip, user_id: userId, success: ok }),
                ]
            )
            .catch((err) => console.error('Failed to log PIN attempt:', err));

        if (!ok) {
            return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
        }

        // Create a user session bound to this device — the plain token goes
        // to the client, only its hash is stored.
        const auth = await resolveDeviceAuth(request, connection, shopId);
        if (auth.deviceId) {
            const token = generateSecureId();
            const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
            try {
                // Opportunistic cleanup of dead sessions
                await connection.execute(
                    isPg
                        ? `DELETE FROM dc_pos.sessions WHERE expires_at <= NOW() OR revoked_at IS NOT NULL`
                        : `DELETE FROM sessions WHERE expires_at <= NOW() OR revoked_at IS NOT NULL`,
                    []
                );
                await connection.execute(
                    isPg
                        ? `INSERT INTO dc_pos.sessions (user_id, device_id, token_hash, expires_at)
                           VALUES ($1, $2, $3, $4)`
                        : `INSERT INTO sessions (user_id, device_id, token_hash, expires_at)
                           VALUES (?, ?, ?, ?)`,
                    [userId, auth.deviceId, sessionTokenHash(token), expiresAt.toISOString()]
                );
                return NextResponse.json({ ok: true, token, expiresAt: expiresAt.toISOString() });
            } catch (error) {
                // Sessions table missing → still validate the PIN so the
                // switch works; the flag feature just won't have a session.
                console.error('Failed to create user session:', error);
                return NextResponse.json({ ok: true });
            }
        }
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Error verifying user PIN:', error);
        return NextResponse.json({ error: 'An error occurred while verifying the PIN' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
