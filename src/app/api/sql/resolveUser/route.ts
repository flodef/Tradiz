import { NextRequest, NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface UserRow {
    key: string;
    name: string;
    role: string;
}

export const dynamic = 'force-dynamic';

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
 * Log access attempt to database using the existing logs table
 */
async function logAccessAttempt(
    connection: import('../db').DbConnection,
    publicKey: string,
    userName: string | null,
    userRole: string | null,
    ipAddress: string,
    userAgent: string,
    browserName: string,
    browserVersion: string,
    osName: string,
    osVersion: string,
    deviceType: string,
    screenResolution: string,
    language: string,
    timezone: string,
    country: string | null,
    city: string | null,
    latitude: number | null,
    longitude: number | null,
    success: boolean
): Promise<void> {
    try {
        const metadata = {
            type: 'access_attempt',
            public_key: publicKey,
            user_name: userName,
            user_role: userRole,
            ip_address: ipAddress,
            user_agent: userAgent,
            browser_name: browserName,
            browser_version: browserVersion,
            os_name: osName,
            os_version: osVersion,
            device_type: deviceType,
            screen_resolution: screenResolution,
            language,
            timezone,
            country,
            city,
            latitude,
            longitude,
            success,
        };

        const query = connection.isPostgreSQL
            ? `INSERT INTO dc_sys.logs (level, message, metadata) VALUES ($1, $2, $3)`
            : `INSERT INTO dc_sys.logs (level, message, metadata) VALUES (?, ?, ?)`;

        await connection.execute(query, [
            success ? 'info' : 'warning',
            `User access attempt: ${userName || 'unknown'} (${publicKey})`,
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
    try {
        const { publicKey, browserData } = await request.json();

        if (!publicKey || typeof publicKey !== 'string') {
            return NextResponse.json({ error: 'Missing or invalid publicKey' }, { status: 400 });
        }

        // Extract request information
        const ipAddress =
            request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
            request.headers.get('x-real-ip') ||
            'unknown';
        const userAgent = request.headers.get('user-agent') || 'unknown';

        // Parse user agent
        const { browserName, browserVersion, osName, osVersion, deviceType } = parseUserAgent(userAgent);

        // Extract browser data from request if provided
        const screenResolution = browserData?.screenResolution || 'unknown';
        const language = browserData?.language || request.headers.get('accept-language')?.split(',')[0] || 'unknown';
        const timezone = browserData?.timezone || 'unknown';
        const country = browserData?.country || null;
        const city = browserData?.city || null;
        const latitude = browserData?.latitude || null;
        const longitude = browserData?.longitude || null;

        const connection = await getPosDb();

        // Query for the specific user with matching key
        const query = connection.isPostgreSQL
            ? `SELECT key, name, role FROM users WHERE key = $1 LIMIT 1`
            : `SELECT key, name, role FROM users WHERE key = ? LIMIT 1`;

        const [rows] = await connection.execute(query, [publicKey]);
        const userRows = rows as UserRow[];
        const foundUser = userRows.length > 0 ? userRows[0] : null;

        // Log access attempt (don't fail the request if logging fails)
        try {
            await logAccessAttempt(
                connection,
                publicKey,
                foundUser?.name || null,
                foundUser?.role || null,
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
                !!foundUser
            );
        } catch (logError) {
            console.error('Failed to log access attempt:', logError);
            // Continue with the request even if logging fails
        }

        await connection.end();

        // Return the resolved user (or null if not found)
        // Client will handle default user creation if needed
        return NextResponse.json(
            {
                user: foundUser
                    ? {
                          name: foundUser.name,
                          role: foundUser.role,
                          key: foundUser.key,
                      }
                    : null,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Error resolving user:', error);
        return NextResponse.json({ error: 'An error occurred while resolving user' }, { status: 500 });
    }
}
