import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';
import { authorizeDeviceOn, isLocalOrUnknownIp, requestIp, sessionTokenHash } from '../deviceAuth';
import { verifyPin } from '../pinHash';
import { insertAuditEvent } from '../auditHelpers';
import { generateSecureId } from '@/app/utils/id';

export const dynamic = 'force-dynamic';

// PINs are short — brute force is bounded by a failure counter kept in
// dc_sys.connections (type 'pin_attempt').
const PIN_WINDOW_MS = 15 * 60 * 1000;
const PIN_MAX_FAILURES = 5;
// Sessions cover a full working day; expiry is checked at resolve time.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
// A well-formed scrypt hash (`salt:hash`) that can never match — used to run
// the same scrypt work when the user or its PIN doesn't exist, so response
// time doesn't reveal which failed (existence oracle).
const DUMMY_PIN_HASH = `${'0'.repeat(32)}:${'0'.repeat(64)}`;

interface UserRow {
    pin_hash: string | null;
    name: string;
}

/**
 * POST /api/sql/verifyUserPin — checks a user's PIN when switching user on
 * the POS. Device-gated (any registered device) and rate-limited:
 * 5 failures / 15 min per user (per IP too when the IP is meaningful).
 */
export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);

    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);
        // Single connection + single device resolution for the whole
        // request — the resolved device is reused for the session binding.
        const authResult = await authorizeDeviceOn(request, connection, shopId);
        if (authResult instanceof NextResponse) return authResult;
        const auth = authResult;

        const body = (await request.json()) as { userId?: number; pin?: string };
        const userId = Number(body.userId);
        const pin = typeof body.pin === 'string' ? body.pin : '';
        if (!Number.isInteger(userId) || userId <= 0 || !pin) {
            return NextResponse.json({ error: 'Missing or invalid userId/pin' }, { status: 400 });
        }

        const isPg = connection.isPostgreSQL;
        const ip = requestIp(request);
        // Electron/localhost requests share the 'unknown' IP — counting
        // failures by IP there would pool every user's attempts on the same
        // terminal (5 wrong PINs across any mix of users → 429 for all).
        // The per-user counter still bounds on-device brute force.
        const ipScoped = !isLocalOrUnknownIp(ip);

        // Rate limit: 5 failures / 15 min, counted per target user — plus
        // per IP when the IP distinguishes clients.
        const windowStart = new Date(Date.now() - PIN_WINDOW_MS).toISOString();
        const countQuery = isPg
            ? `SELECT COUNT(*) AS count FROM dc_sys.connections
               WHERE metadata->>'type' = 'pin_attempt' AND metadata->>'success' = 'false'
               AND created_at > $1
               AND (metadata->>'user_id' = $2${ipScoped ? ` OR metadata->>'ip_address' = $3` : ''})`
            : `SELECT COUNT(*) AS count FROM DC_SYS.connections
               WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.type')) = 'pin_attempt'
               AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.success')) = 'false' AND created_at > ?
               AND (JSON_EXTRACT(metadata, '$.user_id') = ?${
                   ipScoped ? ` OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.ip_address')) = ?` : ''
               })`;
        // $.user_id is stored as a JSON number — comparing it to a numeric
        // param is correct; do NOT wrap it in JSON_UNQUOTE (the unquoted
        // string '3' would not match the JSON number 3).
        const countParams: unknown[] = [
            windowStart,
            ...(isPg ? [String(userId)] : [userId]),
            ...(ipScoped ? [ip] : []),
        ];
        const [countRows] = await connection.execute(countQuery, countParams);
        const failures = Number((countRows as { count: number | string }[])[0]?.count) || 0;
        if (failures >= PIN_MAX_FAILURES) {
            return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
        }

        const [rows] = await connection.execute(
            isPg
                ? 'SELECT pin_hash, name FROM dc_pos.users WHERE id = $1 LIMIT 1'
                : 'SELECT pin_hash, name FROM users WHERE id = ? LIMIT 1',
            [userId]
        );
        const userRow = (rows as UserRow[])[0];

        // Always run exactly one scrypt: against the stored hash when it
        // exists, else against a dummy — so response time can't reveal
        // whether the user or its PIN exists (timing oracle).
        const ok = !!userRow?.pin_hash && (await verifyPin(pin, userRow.pin_hash));
        if (!userRow?.pin_hash) await verifyPin(pin, DUMMY_PIN_HASH).catch(() => {});

        // Log the attempt (never the PIN itself)
        await connection
            .execute(
                isPg
                    ? `INSERT INTO dc_sys.connections (level, message, metadata) VALUES ($1, $2, $3)`
                    : `INSERT INTO DC_SYS.connections (level, message, metadata) VALUES (?, ?, ?)`,
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

        // Audit the successful authentication (D.1) — this is what attributes
        // later sensitive writes to a real user instead of just a device.
        // Awaited: a fire-and-forget insert can be cut off by the connection
        // closing in `finally`, silently dropping exactly the event this
        // audit exists for.
        await insertAuditEvent(connection, {
            event_type: 'user_login',
            entity_type: 'users',
            entity_id: String(userId),
            user_name: userRow?.name ?? `user-${userId}`,
            detail: 'PIN verified',
        }).catch((err) => console.error('Failed to audit user login:', err));

        // Create a user session bound to this device — the plain token goes
        // to the client, only its hash is stored.
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
                // MariaDB TIMESTAMP rejects the ISO 'T…Z' suffix — use the
                // SQL datetime literal (same convention as savePartialPayment).
                const expiresAtSql = isPg
                    ? expiresAt.toISOString()
                    : expiresAt.toISOString().slice(0, 19).replace('T', ' ');
                await connection.execute(
                    isPg
                        ? `INSERT INTO dc_pos.sessions (user_id, device_id, token_hash, expires_at)
                           VALUES ($1, $2, $3, $4)`
                        : `INSERT INTO sessions (user_id, device_id, token_hash, expires_at)
                           VALUES (?, ?, ?, ?)`,
                    [userId, auth.deviceId, sessionTokenHash(token), expiresAtSql]
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
