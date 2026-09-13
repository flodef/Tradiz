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
            return NextResponse.json({ error: 'Appareil non autorisé' }, { status: 403 });
        }
        return null;
    } finally {
        await connection?.end();
    }
}
