import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from './db';

export interface DeviceAuth {
    /** The device public key is registered in the devices table. */
    authorized: boolean;
    /** The device's linked user has the Admin role (or bootstrap/demo). */
    admin: boolean;
    /** The device is flagged as an intervention device. */
    intervention: boolean;
    /** The linked user's role (null when the device has no user). */
    role: string | null;
}

const DENIED: DeviceAuth = { authorized: false, admin: false, intervention: false, role: null };

/**
 * The caller's device public key — sent as the `x-public-key` header (same
 * convention as getDeviceHardware) or the `publicKey` query param.
 */
export function deviceKeyFromRequest(request: Request): string | null {
    return request.headers.get('x-public-key') || new URL(request.url).searchParams.get('publicKey');
}

// --- Denial throttling (B.1) ---
// Denied calls are recorded in dc_sys.connections (type 'device_denied') and
// an IP that accumulates too many denials gets 429 instead of 403. Writes are
// deduplicated per (ip, key prefix) over a minute so a legitimately
// unregistered POS doesn't flood the table.
const DENIAL_WINDOW_MS = 15 * 60 * 1000;
const DENIAL_THRESHOLD = 30;
const DENIAL_DEDUPE_MS = 60 * 1000;

export function requestIp(request: Request): string {
    return (
        request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() ||
        request.headers.get('x-real-ip') ||
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        'unknown'
    );
}

export const isLocalOrUnknownIp = (ip: string) =>
    ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1' || ip === 'unknown';

/**
 * Records a denied access (deduped) and returns a 429 response when the
 * caller's IP exceeded the denial threshold — null otherwise. Call before
 * returning a 403/404 on an unknown-key path. Never throws.
 */
export async function recordDeniedAccess(
    connection: DbConnection,
    request: Request,
    key: string | null
): Promise<NextResponse | null> {
    const ip = requestIp(request);
    if (isLocalOrUnknownIp(ip)) return null;

    try {
        const isPg = connection.isPostgreSQL;
        const windowStart = new Date(Date.now() - DENIAL_WINDOW_MS).toISOString();
        const countQuery = isPg
            ? `SELECT COUNT(*) AS count FROM dc_sys.connections
               WHERE metadata->>'type' = 'device_denied' AND metadata->>'ip_address' = $1 AND created_at > $2`
            : `SELECT COUNT(*) AS count FROM connections
               WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.type')) = 'device_denied'
               AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.ip_address')) = ? AND created_at > ?`;
        const [rows] = await connection.execute(countQuery, [ip, windowStart]);
        const count = Number((rows as { count: number | string }[])[0]?.count) || 0;
        if (count >= DENIAL_THRESHOLD) {
            return NextResponse.json({ error: 'Too many denied attempts' }, { status: 429 });
        }

        // Dedupe: skip the INSERT when this key was already denied <60s ago.
        const dedupeStart = new Date(Date.now() - DENIAL_DEDUPE_MS).toISOString();
        const dupQuery = isPg
            ? `SELECT 1 FROM dc_sys.connections
               WHERE metadata->>'type' = 'device_denied' AND metadata->>'ip_address' = $1
               AND metadata->>'key_prefix' = $2 AND created_at > $3 LIMIT 1`
            : `SELECT 1 FROM connections
               WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.type')) = 'device_denied'
               AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.ip_address')) = ?
               AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.key_prefix')) = ? AND created_at > ? LIMIT 1`;
        const keyPrefix = (key ?? '').slice(0, 8);
        const [dupRows] = await connection.execute(dupQuery, [ip, keyPrefix, dedupeStart]);
        if ((dupRows as unknown[]).length) return null;

        await connection.execute(
            isPg
                ? `INSERT INTO dc_sys.connections (level, message, metadata) VALUES ($1, $2, $3)`
                : `INSERT INTO connections (level, message, metadata) VALUES (?, ?, ?)`,
            [
                'warn',
                'Device access denied',
                JSON.stringify({ type: 'device_denied', ip_address: ip, key_prefix: keyPrefix }),
            ]
        );
        return null;
    } catch (error) {
        // Never let throttling break the request path — a missing/broken
        // connections table must not turn denials into 500s.
        console.error('Failed to record denied access:', error);
        return null;
    }
}

/**
 * Resolves the calling device and its linked user's role:
 * - unknown key → authorized: false (no bootstrap: a sysadmin unlocks the
 *   app by inserting the device's key into `devices` — it can be retrieved
 *   from `dc_sys.connections`, where resolveUser logs every access attempt)
 * - demo shop → unknown keys are auto-registered against the first Admin
 *   user (mirrors resolveUser, so the demo stays open to new testers)
 * - known device → admin = linked user's role is 'Admin'
 */
export async function resolveDeviceAuth(
    request: Request,
    connection: DbConnection,
    shopId: string
): Promise<DeviceAuth> {
    const key = deviceKeyFromRequest(request);
    if (!key) return DENIED;

    const [rows] = await connection.execute(
        connection.isPostgreSQL
            ? `SELECT d.intervention, u.role
               FROM dc_pos.devices d
               LEFT JOIN dc_pos.users u ON u.id = d.user_id
               WHERE d.public_key = $1 LIMIT 1`
            : `SELECT d.intervention, u.role
               FROM devices d
               LEFT JOIN users u ON u.id = d.user_id
               WHERE d.public_key = ? LIMIT 1`,
        [key]
    );
    const row = (rows as { intervention: number | boolean; role: string | null }[])[0];

    if (!row) {
        if (shopId === 'demo') {
            const [adminRows] = await connection.execute(
                connection.isPostgreSQL
                    ? `SELECT id FROM dc_pos.users WHERE role = 'Admin' ORDER BY id LIMIT 1`
                    : `SELECT id FROM users WHERE role = 'Admin' ORDER BY id LIMIT 1`
            );
            const adminId = (adminRows as { id: number }[])[0]?.id;
            if (adminId) {
                await connection.execute(
                    connection.isPostgreSQL
                        ? `INSERT INTO dc_pos.devices (label, public_key, user_id, connected, created_at)
                           VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)
                           ON CONFLICT (public_key) DO NOTHING`
                        : `INSERT INTO devices (label, public_key, user_id, connected, created_at)
                           VALUES (?, ?, ?, true, CURRENT_TIMESTAMP)
                           ON DUPLICATE KEY UPDATE id = id`,
                    [`Démo-${key.slice(0, 8)}`, key, adminId]
                );
                return { authorized: true, admin: true, intervention: false, role: 'Admin' };
            }
        }
        return DENIED;
    }

    const role = row.role ?? null;
    return {
        authorized: true,
        admin: role?.toLowerCase() === 'admin',
        intervention: !!row.intervention,
        role,
    };
}

/**
 * Gate for sensitive routes: resolves the device on its own POS connection so
 * it works regardless of which database the route itself uses. `roles`
 * restricts to specific user roles (e.g. ['admin']); omitted means any
 * registered device is accepted. Returns a 403 response when denied, null
 * when authorized.
 */
export async function assertDeviceAuthorized(
    request: Request,
    shopId: string,
    roles?: string[]
): Promise<NextResponse | null> {
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);
        const auth = await resolveDeviceAuth(request, connection, shopId);
        const effectiveRole = auth.admin ? 'admin' : (auth.role?.toLowerCase() ?? '');
        if (!auth.authorized || (roles && !roles.includes(effectiveRole))) {
            const throttled = await recordDeniedAccess(connection, request, deviceKeyFromRequest(request));
            if (throttled) return throttled;
            return NextResponse.json({ error: 'Appareil non autorisé' }, { status: 403 });
        }
        return null;
    } finally {
        await connection?.end();
    }
}
