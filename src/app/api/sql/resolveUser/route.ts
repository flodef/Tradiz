import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextRequest, NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';
import { isLocalOrUnknownIp, requestIp } from '../deviceAuth';

interface UserRow {
    id: number;
    name: string;
    role: string;
    reference: string;
}

const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOCKOUT_BASE_MS = 15 * 60 * 1000;
const LOCKOUT_MAX_MS = 24 * 60 * 60 * 1000;
export const dynamic = 'force-dynamic';

/**
 * Progressive lockout (D.3): below MAX_FAILED_ATTEMPTS there is no delay;
 * beyond it the cooldown doubles per failure — 15 min, 30 min, 1 h, 2 h …
 * capped at 24 h. A mistyped key on a legit device recovers quickly, while
 * brute force becomes exponentially slow. Exported for tests.
 */
export function lockoutMs(failures: number): number {
    if (failures < MAX_FAILED_ATTEMPTS) return 0;
    return Math.min(LOCKOUT_BASE_MS * 2 ** (failures - MAX_FAILED_ATTEMPTS), LOCKOUT_MAX_MS);
}

/**
 * Parse user agent string to extract browser and OS information
 */
function parseUserAgent(userAgent: string): {
    browserName: string;
    browserVersion: string;
    osName: string;
    osVersion: string;
    deviceType: string;
} {
    const ua = userAgent.toLowerCase();

    // Browser detection
    let browserName = 'Unknown';
    let browserVersion = '';

    if (ua.includes('chrome') && !ua.includes('edg')) {
        browserName = 'Chrome';
        const match = ua.match(/chrome\/(\d+\.\d+\.\d+\.\d+)/);
        browserVersion = match ? match[1] : '';
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
        browserName = 'Safari';
        const match = ua.match(/version\/(\d+\.\d+)/);
        browserVersion = match ? match[1] : '';
    } else if (ua.includes('firefox')) {
        browserName = 'Firefox';
        const match = ua.match(/firefox\/(\d+\.\d+)/);
        browserVersion = match ? match[1] : '';
    } else if (ua.includes('edg')) {
        browserName = 'Edge';
        const match = ua.match(/edg\/(\d+\.\d+\.\d+\.\d+)/);
        browserVersion = match ? match[1] : '';
    }

    // OS detection
    let osName = 'Unknown';
    let osVersion = '';

    if (ua.includes('windows')) {
        osName = 'Windows';
        const match = ua.match(/windows nt (\d+\.\d+)/);
        osVersion = match ? match[1] : '';
    } else if (ua.includes('mac os x')) {
        osName = 'macOS';
        const match = ua.match(/mac os x (\d+[_\.]\d+)/);
        osVersion = match ? match[1].replace('_', '.') : '';
    } else if (ua.includes('android')) {
        osName = 'Android';
        const match = ua.match(/android (\d+\.\d+)/);
        osVersion = match ? match[1] : '';
    } else if (ua.includes('iphone') || ua.includes('ipad')) {
        osName = 'iOS';
        const match = ua.match(/os (\d+[_\.]\d+)/);
        osVersion = match ? match[1].replace('_', '.') : '';
    } else if (ua.includes('linux')) {
        osName = 'Linux';
    }

    // Device type
    let deviceType = 'Desktop';
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
        deviceType = 'Mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
        deviceType = 'Tablet';
    }

    return { browserName, browserVersion, osName, osVersion, deviceType };
}

/**
 * Check if an IP is in cooldown after repeated failed attempts.
 * Returns the remaining lockout in ms (0 when allowed). Fails closed.
 */
async function ipLockoutRemainingMs(connection: import('../db').DbConnection, ipAddress: string): Promise<number> {
    try {
        const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
        const query = connection.isPostgreSQL
            ? `SELECT COUNT(*) as count, MAX(created_at) as last_at FROM dc_sys.connections
               WHERE metadata->>'ip_address' = $1
               AND metadata->>'type' = 'access_attempt'
               AND metadata->>'success' = 'false'
               AND created_at > $2`
            : `SELECT COUNT(*) as count, MAX(created_at) as last_at FROM DC_SYS.connections
               WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.ip_address')) = ?
               AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.type')) = 'access_attempt'
               AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.success')) = 'false'
               AND created_at > ?`;

        const [rows] = await connection.execute(query, [ipAddress, windowStart]);
        const row = (rows as { count: number | string; last_at: string | null }[])[0];
        // pg returns COUNT(*) as a string — coerce to number
        const count = Number(row?.count) || 0;
        const cooldown = lockoutMs(count);
        if (cooldown === 0 || !row?.last_at) return 0;

        const elapsed = Date.now() - new Date(row.last_at).getTime();
        return Math.max(0, cooldown - elapsed);
    } catch (error) {
        // Fail closed: if we can't check the block list, assume blocked.
        // This prevents a DB outage from disabling all IP blocking.
        console.error('Failed to check IP block status (failing closed):', error);
        return LOCKOUT_MAX_MS;
    }
}

interface AccessAttempt {
    publicKey: string;
    userName: string | null;
    userRole: string | null;
    ipAddress: string;
    userAgent: string;
    browserName: string;
    browserVersion: string;
    osName: string;
    osVersion: string;
    deviceType: string;
    screenResolution: string;
    language: string;
    timezone: string;
    country: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    success: boolean;
}

/**
 * Log access attempt to database using the existing logs table
 * Only logs connections from Europe/Paris timezone
 */
async function logAccessAttempt(connection: import('../db').DbConnection, attempt: AccessAttempt): Promise<void> {
    try {
        // Only log connections from Europe/Paris timezone
        if (attempt.timezone !== 'Europe/Paris') return;

        // The full key is stored ONLY on failure: it is the channel by which
        // an admin learns an unregistered device's key (see getFailedLoginKey
        // and the unknown-device banner). For a successful resolution the key
        // is a working credential — a prefix is enough to correlate.
        const storedKey = attempt.success ? attempt.publicKey.slice(0, 8) : attempt.publicKey;

        const metadata = {
            type: 'access_attempt',
            public_key: storedKey,
            user_name: attempt.userName,
            user_role: attempt.userRole,
            ip_address: attempt.ipAddress,
            user_agent: attempt.userAgent,
            browser_name: attempt.browserName,
            browser_version: attempt.browserVersion,
            os_name: attempt.osName,
            os_version: attempt.osVersion,
            device_type: attempt.deviceType,
            screen_resolution: attempt.screenResolution,
            language: attempt.language,
            timezone: attempt.timezone,
            country: attempt.country,
            city: attempt.city,
            latitude: attempt.latitude,
            longitude: attempt.longitude,
            success: attempt.success,
        };

        const query = connection.isPostgreSQL
            ? `INSERT INTO dc_sys.connections (level, message, metadata) VALUES ($1, $2, $3)`
            : `INSERT INTO DC_SYS.connections (level, message, metadata) VALUES (?, ?, ?)`;

        await connection.execute(query, [
            attempt.success ? 'info' : 'error',
            `User access attempt: ${attempt.userName || 'unknown'} (${storedKey})`,
            JSON.stringify(metadata),
        ]);
    } catch (error) {
        // Don't fail the request if logging fails
        console.error('Failed to log access attempt:', error);
    }
}

/**
 * POST /api/sql/resolveUser
 * Resolves a user from their public key server-side.
 * Never exposes the full user list - only returns the matched user or default.
 * Also logs access attempts with browser characteristics.
 */
export async function POST(request: NextRequest) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        let publicKey: string;
        let browserData:
            | {
                  timezone?: string;
                  country?: string;
                  city?: string;
                  latitude?: number;
                  longitude?: number;
                  screenResolution?: string;
                  language?: string;
              }
            | undefined;
        try {
            const parsed = await request.json();
            publicKey = parsed.publicKey;
            browserData = parsed.browserData;
        } catch {
            // Client disconnected before sending a complete body (ECONNRESET).
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        if (!publicKey || typeof publicKey !== 'string') {
            return NextResponse.json({ error: 'Missing or invalid publicKey' }, { status: 400 });
        }

        // Extract request information — requestIp prefers Vercel's trusted
        // headers (set by the platform, not spoofable) and falls back to
        // x-forwarded-for / x-real-ip for local dev or other proxies.
        const ipAddress = requestIp(request);
        const userAgent = request.headers.get('user-agent') || 'unknown';

        // Parse user agent
        const { browserName, browserVersion, osName, osVersion, deviceType } = parseUserAgent(userAgent);

        // Extract browser data from request if provided
        const screenResolution = browserData?.screenResolution || 'unknown';
        const language = browserData?.language || request.headers.get('accept-language')?.split(',')[0] || 'unknown';
        // Prefer server-side timezone from Vercel (x-vercel-ip-timezone) over client-supplied value
        // to prevent spoofing. Fall back to client value for local dev where Vercel headers aren't set.
        const timezone = request.headers.get('x-vercel-ip-timezone') || browserData?.timezone || 'unknown';
        const country = request.headers.get('x-vercel-ip-country') || browserData?.country || null;
        const city = request.headers.get('x-vercel-ip-city') || browserData?.city || null;
        const latitude = browserData?.latitude || null;
        const longitude = browserData?.longitude || null;

        connection = await getPosDb(shopId);

        // Demo mode: skip timezone check and auto-register unknown devices
        const isDemo = shopId === 'demo';

        // Immediately block users not from Europe/Paris timezone
        // (skipped in demo mode so anyone can test)
        if (!isDemo && timezone !== 'Europe/Paris') {
            await connection.end();
            return NextResponse.json({ error: 'Access denied: Invalid timezone' }, { status: 403 });
        }

        // Check if users table is empty (fresh DB with no users)
        const countQuery = connection.isPostgreSQL
            ? `SELECT COUNT(*) as count FROM dc_pos.users`
            : `SELECT COUNT(*) as count FROM users`;
        const [countRows] = await connection.execute(countQuery);
        const userCount = Number((countRows as { count: string | number }[])[0]?.count || 0);

        if (userCount === 0) {
            await connection.end();
            // No users in database - indicate missing data
            return NextResponse.json({ user: null, noUsers: true }, { status: 200 });
        }

        // Query for the specific device and its associated user
        const query = connection.isPostgreSQL
            ? `SELECT u.id, u.name, u.role, u.reference
               FROM dc_pos.devices d
               JOIN dc_pos.users u ON u.id = d.user_id
               WHERE d.public_key = $1
               LIMIT 1`
            : `SELECT u.id, u.name, u.role, u.reference
               FROM devices d
               JOIN users u ON u.id = d.user_id
               WHERE d.public_key = ?
               LIMIT 1`;

        const [rows] = await connection.execute(query, [publicKey]);
        const userRows = rows as UserRow[];
        let foundUser = userRows.length > 0 ? userRows[0] : null;

        // Demo mode: auto-register unknown devices as the first admin user
        // so anyone can test the POS without prior device registration.
        if (!foundUser && isDemo) {
            const adminQuery = connection.isPostgreSQL
                ? `SELECT id, name, role, reference FROM dc_pos.users WHERE role = 'Admin' ORDER BY id LIMIT 1`
                : `SELECT id, name, role, reference FROM users WHERE role = 'Admin' ORDER BY id LIMIT 1`;
            const [adminRows] = await connection.execute(adminQuery);
            const admin = (adminRows as UserRow[])[0];
            if (admin) {
                const insertDevice = connection.isPostgreSQL
                    ? `INSERT INTO dc_pos.devices (label, public_key, user_id, connected, created_at)
                       VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)
                       ON CONFLICT (public_key) DO NOTHING`
                    : `INSERT INTO devices (label, public_key, user_id, connected, created_at)
                       VALUES (?, ?, ?, true, CURRENT_TIMESTAMP)
                       ON DUPLICATE KEY UPDATE id = id`;
                const label = `Démo-${publicKey.slice(0, 8)}`;
                await connection.execute(insertDevice, [label, publicKey, admin.id]);
                foundUser = admin;
            }
        }

        // Check if IP is blocked due to too many failed attempts
        // Only apply block if user is NOT authenticated (not found in system)
        // Skip blocking for localhost/unknown IPs (Electron app requests come
        // from localhost with no forwarding headers).
        if (!foundUser && !isLocalOrUnknownIp(ipAddress)) {
            const lockoutMsRemaining = await ipLockoutRemainingMs(connection, ipAddress);
            if (lockoutMsRemaining > 0) {
                await connection.end();
                return NextResponse.json(
                    { error: 'Too many failed attempts. Please try again later.' },
                    { status: 429, headers: { 'Retry-After': String(Math.ceil(lockoutMsRemaining / 1000)) } }
                );
            }
        }

        // Log access attempt
        await logAccessAttempt(connection, {
            publicKey,
            userName: foundUser?.name || null,
            userRole: foundUser?.role || null,
            ipAddress,
            userAgent,
            browserName,
            browserVersion,
            osName,
            osVersion,
            deviceType,
            screenResolution,
            language,
            timezone,
            country,
            city,
            latitude,
            longitude,
            success: !!foundUser,
        });

        await connection.end();

        // Return the resolved user (or null if not found)
        // Client will handle default user creation if needed
        return NextResponse.json(
            {
                user: foundUser
                    ? {
                          id: Number(foundUser.id),
                          name: foundUser.name,
                          role: foundUser.role,
                          reference: foundUser.reference,
                      }
                    : null,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Error resolving user:', error);
        return NextResponse.json({ error: 'An error occurred while resolving user' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
