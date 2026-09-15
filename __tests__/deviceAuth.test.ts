import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbConnection } from '../src/app/api/sql/db';

/**
 * Tests for the device-authorization gate that now protects the internal
 * /api/sql/* routes. The DB layer is a stateful fake simulating the
 * `devices` + `users` tables.
 */

const state = vi.hoisted(() => {
    const fakeConn: DbConnection = {
        isPostgreSQL: true,
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        end: async () => {},
        query: async () => ({ rows: [] }),
        execute: async (query: string, params?: unknown[]) => {
            const q = query.replace(/\s+/g, ' ');

            // Device lookup by public key (resolveDeviceAuth)
            if (q.includes('FROM dc_pos.devices d') && q.includes('public_key')) {
                const key = String(params?.[0]);
                const d = state.devices[key];
                return [d ? [{ id: d.id, intervention: d.intervention, role: d.role }] : [], {}];
            }

            // Device id lookup after demo auto-registration
            if (q.includes('SELECT id FROM dc_pos.devices WHERE public_key')) {
                const key = String(params?.[0]);
                return [[{ id: state.devices[key]?.id ?? 0 }], {}];
            }

            // First admin user (demo auto-registration)
            if (q.includes('FROM dc_pos.users') && q.includes("role = 'Admin'")) return [[{ id: 42 }], {}];

            // Demo auto-registration insert
            if (q.startsWith('INSERT') && q.includes('dc_pos.devices')) {
                const key = String(params?.[1]);
                state.registeredKeys.push(key);
                state.devices[key] = { role: 'Admin', intervention: false, id: 100 + state.registeredKeys.length };
                return [[], {}];
            }

            // requireUserAuth flag (shopRequiresUserAuth)
            if (q.includes('dc_pos.parameters') && q.includes('requireUserAuth')) {
                return [[{ param_value: String(state.requireUserAuth) }], {}];
            }

            // Session lookup (resolveUserSession)
            if (q.includes('FROM dc_pos.sessions s')) {
                const [hash, deviceId] = params as [string, number];
                const s = state.sessions.find((sess) => sess.tokenHash === hash && sess.deviceId === Number(deviceId));
                return [s ? [{ user_id: s.userId, name: s.name, role: s.role, expires_at: s.expiresAt }] : [], {}];
            }

            // Denial-throttle queries on dc_sys.connections
            if (q.includes('COUNT(*)') && q.includes('dc_sys.connections')) {
                const ip = String(params?.[0]);
                const windowStart = Date.parse(String(params?.[1]));
                const count = state.denials.filter((d) => d.ip === ip && d.at >= windowStart).length;
                return [[{ count }], {}];
            }
            if (q.startsWith('SELECT 1 FROM dc_sys.connections')) {
                const [ip, keyPrefix, dedupeStart] = params as [string, string, string];
                const hit = state.denials.some(
                    (d) => d.ip === ip && d.keyPrefix === keyPrefix && d.at >= Date.parse(dedupeStart)
                );
                return [hit ? [{ '?column?': 1 }] : [], {}];
            }
            if (q.startsWith('INSERT') && q.includes('dc_sys.connections')) {
                const meta = JSON.parse(String(params?.[2]));
                state.denials.push({ ip: meta.ip_address, keyPrefix: meta.key_prefix, at: Date.now() });
                return [[], {}];
            }

            return [[], {}];
        },
    };
    return {
        // devices: public_key → { id, role, intervention }
        devices: {} as Record<string, { id: number; role: string | null; intervention: boolean }>,
        registeredKeys: [] as string[],
        denials: [] as { ip: string; keyPrefix: string; at: number }[],
        requireUserAuth: false,
        sessions: [] as {
            tokenHash: string;
            deviceId: number;
            userId: number;
            name: string;
            role: string;
            expiresAt: string;
        }[],
        conn: fakeConn,
    };
});

vi.mock('@/app/constants/shop', () => ({
    getShopIdFromRequest: () => 'test-shop',
    getShopIdFromHostname: () => 'test-shop',
    getShopFromHostname: () => 'test-shop',
    getShopFromSubdomain: () => 'test-shop',
    SHOP_ID: 'test-shop',
    fetchShopId: async () => 'test-shop',
}));

vi.mock('@/app/api/sql/db', () => ({
    getPosDb: async () => state.conn,
    getMainDb: async () => state.conn,
    withPosDb: async (_shopId: string | undefined, fn: (c: DbConnection) => unknown) => fn(state.conn),
    withTransaction: async (_c: DbConnection, fn: () => unknown) => fn(),
    executeInsert: async () => 1,
}));

import {
    resolveDeviceAuth,
    assertDeviceAuthorized,
    deviceKeyFromRequest,
    sessionTokenHash,
    shopRequiresUserAuth,
} from '../src/app/api/sql/deviceAuth';
import { GET as getParametersGET } from '../src/app/api/sql/getParameters/route';
import { lockoutMs } from '../src/app/api/sql/resolveUser/route';

const req = (key?: string, via: 'header' | 'query' = 'header', ip?: string, sessionToken?: string) =>
    new Request(`http://localhost/api/sql/test${via === 'query' && key ? `?publicKey=${key}` : ''}`, {
        headers: {
            ...(key && via === 'header' ? { 'x-public-key': key } : {}),
            ...(ip ? { 'x-forwarded-for': ip } : {}),
            ...(sessionToken ? { 'x-user-token': sessionToken } : {}),
        },
    });

beforeEach(() => {
    state.devices = {
        'key-admin': { id: 1, role: 'Admin', intervention: false },
        'key-cashier': { id: 2, role: 'Caissier', intervention: false },
        'key-intervention': { id: 3, role: 'Admin', intervention: true },
        'key-nouser': { id: 4, role: null, intervention: false },
    };
    state.registeredKeys = [];
    state.denials = [];
    state.requireUserAuth = false;
    state.sessions = [];
});

describe('deviceKeyFromRequest', () => {
    it('lit la clé depuis le header x-public-key', () => {
        expect(deviceKeyFromRequest(req('abc', 'header'))).toBe('abc');
    });
    it('lit la clé depuis le paramètre publicKey', () => {
        expect(deviceKeyFromRequest(req('xyz', 'query'))).toBe('xyz');
    });
    it('renvoie null sans clé', () => {
        expect(deviceKeyFromRequest(req())).toBeNull();
    });
});

describe('resolveDeviceAuth', () => {
    it('rejette un appel sans clé', async () => {
        const auth = await resolveDeviceAuth(req(), state.conn, 'shop');
        expect(auth.authorized).toBe(false);
        expect(auth.admin).toBe(false);
    });

    it('rejette une clé inconnue hors démo', async () => {
        const auth = await resolveDeviceAuth(req('unknown'), state.conn, 'shop');
        expect(auth.authorized).toBe(false);
        expect(state.registeredKeys).toHaveLength(0);
    });

    it('auto-enregistre une clé inconnue sur la boutique démo', async () => {
        const auth = await resolveDeviceAuth(req('new-demo-key'), state.conn, 'demo');
        expect(auth.authorized).toBe(true);
        expect(auth.admin).toBe(true);
        expect(state.registeredKeys).toEqual(['new-demo-key']);
    });

    it('autorise un appareil enregistré avec son rôle', async () => {
        const auth = await resolveDeviceAuth(req('key-cashier'), state.conn, 'shop');
        expect(auth.authorized).toBe(true);
        expect(auth.admin).toBe(false);
        expect(auth.role).toBe('Caissier');
    });

    it('un appareil sans utilisateur lié est enregistré mais pas admin', async () => {
        const auth = await resolveDeviceAuth(req('key-nouser'), state.conn, 'shop');
        expect(auth.authorized).toBe(true);
        expect(auth.admin).toBe(false);
    });
});

describe('assertDeviceAuthorized', () => {
    it('403 sans clé', async () => {
        const res = await assertDeviceAuthorized(req(), 'shop');
        expect(res?.status).toBe(403);
    });

    it('403 avec une clé inconnue', async () => {
        const res = await assertDeviceAuthorized(req('unknown'), 'shop');
        expect(res?.status).toBe(403);
    });

    it('null (autorisé) pour un appareil enregistré, quel que soit le rôle', async () => {
        expect(await assertDeviceAuthorized(req('key-cashier'), 'shop')).toBeNull();
        expect(await assertDeviceAuthorized(req('key-nouser'), 'shop')).toBeNull();
    });

    it("restriction ['admin'] : caissier refusé, admin accepté", async () => {
        expect((await assertDeviceAuthorized(req('key-cashier'), 'shop', ['admin']))?.status).toBe(403);
        expect(await assertDeviceAuthorized(req('key-admin'), 'shop', ['admin'])).toBeNull();
    });
});

describe('Throttling des accès refusés', () => {
    it('une IP distante refusée est journalisée dans connections', async () => {
        const res = await assertDeviceAuthorized(req('unknown', 'header', '1.2.3.4'), 'shop');
        expect(res?.status).toBe(403);
        expect(state.denials).toHaveLength(1);
        expect(state.denials[0].keyPrefix).toBe('unknown'.slice(0, 8));
    });

    it('les refus répétés de la même clé sont dédupliqués (1 log / min)', async () => {
        await assertDeviceAuthorized(req('unknown', 'header', '1.2.3.4'), 'shop');
        await assertDeviceAuthorized(req('unknown', 'header', '1.2.3.4'), 'shop');
        await assertDeviceAuthorized(req('unknown', 'header', '1.2.3.4'), 'shop');
        expect(state.denials).toHaveLength(1);
    });

    it('les requêtes sans IP / localhost ne sont pas journalisées', async () => {
        await assertDeviceAuthorized(req('unknown'), 'shop');
        await assertDeviceAuthorized(req('unknown', 'header', '127.0.0.1'), 'shop');
        expect(state.denials).toHaveLength(0);
    });

    it('une IP au-delà du seuil de refus obtient 429 au lieu de 403', async () => {
        const now = Date.now();
        state.denials = Array.from({ length: 30 }, (_, i) => ({
            ip: '5.6.7.8',
            keyPrefix: `key${i}`,
            at: now - 60_000,
        }));
        const res = await assertDeviceAuthorized(req('another-bad-key', 'header', '5.6.7.8'), 'shop');
        expect(res?.status).toBe(429);
    });

    it('un appareil autorisé n’est jamais throttle', async () => {
        const now = Date.now();
        state.denials = Array.from({ length: 50 }, (_, i) => ({
            ip: '9.9.9.9',
            keyPrefix: `key${i}`,
            at: now - 60_000,
        }));
        expect(await assertDeviceAuthorized(req('key-admin', 'header', '9.9.9.9'), 'shop')).toBeNull();
    });
});

describe('Sessions utilisateur (requireUserAuth)', () => {
    const addSession = (deviceId: number, role: string, token = 'session-token') => {
        state.sessions.push({
            tokenHash: sessionTokenHash(token),
            deviceId,
            userId: 10,
            name: 'Gérant',
            role,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        });
        return token;
    };

    it('flag inactif → le rôle du device suffit (comportement actuel)', async () => {
        expect(await assertDeviceAuthorized(req('key-admin'), 'shop', ['admin'])).toBeNull();
    });

    it('flag actif → device admin sans session = 403 requireUserAuth', async () => {
        state.requireUserAuth = true;
        const res = await assertDeviceAuthorized(req('key-admin'), 'shop', ['admin']);
        expect(res?.status).toBe(403);
        expect((await res?.json())?.requireUserAuth).toBe(true);
    });

    it('flag actif → session admin autorise, même sur un device caissier', async () => {
        state.requireUserAuth = true;
        const token = addSession(2, 'Admin');
        expect(
            await assertDeviceAuthorized(req('key-cashier', 'header', undefined, token), 'shop', ['admin'])
        ).toBeNull();
    });

    it('flag actif → session non-admin ne suffit pas', async () => {
        state.requireUserAuth = true;
        const token = addSession(1, 'Caissier');
        const res = await assertDeviceAuthorized(req('key-admin', 'header', undefined, token), 'shop', ['admin']);
        expect(res?.status).toBe(403);
    });

    it('un token volé ne marche pas sur un autre appareil', async () => {
        state.requireUserAuth = true;
        const token = addSession(2, 'Admin'); // session bound to cashier device
        const res = await assertDeviceAuthorized(req('key-admin', 'header', undefined, token), 'shop', ['admin']);
        expect(res?.status).toBe(403);
    });

    it('les devices intervention restent exemptés du PIN', async () => {
        state.requireUserAuth = true;
        expect(await assertDeviceAuthorized(req('key-intervention'), 'shop', ['admin'])).toBeNull();
    });

    it('flag actif → les routes non-admin restent accessibles sans session', async () => {
        state.requireUserAuth = true;
        expect(await assertDeviceAuthorized(req('key-cashier'), 'shop')).toBeNull();
    });

    it('une erreur DB sur le flag fait échouer fermé (auth requise), pas ouvert', async () => {
        const broken: DbConnection = {
            ...state.conn,
            execute: async () => {
                throw new Error('parameters table missing');
            },
        };
        expect(await shopRequiresUserAuth(broken)).toBe(true);
        // And a fully broken connection propagates the error (→ 500 at the
        // route level) — it never errors open into device-level access.
        await expect(assertDeviceAuthorized(req('key-admin'), 'shop', ['admin'], broken)).rejects.toThrow();
    });
});

describe('Gate appliqué aux routes internes', () => {
    it('GET /api/sql/getParameters sans clé → 403', async () => {
        const res = await getParametersGET(new Request('http://localhost/api/sql/getParameters'));
        expect(res.status).toBe(403);
    });

    it('GET /api/sql/getParameters avec clé enregistrée → passe le guard', async () => {
        const res = await getParametersGET(
            new Request('http://localhost/api/sql/getParameters', { headers: { 'x-public-key': 'key-admin' } })
        );
        // Guard passed — the route then runs against the empty fake DB and
        // returns whatever it returns, just not a 403.
        expect(res.status).not.toBe(403);
    });
});

describe('Verrouillage progressif (resolveUser)', () => {
    it('pas de délai sous le seuil de 3 échecs', () => {
        expect(lockoutMs(0)).toBe(0);
        expect(lockoutMs(1)).toBe(0);
        expect(lockoutMs(2)).toBe(0);
    });

    it('cooldown exponentiel à partir du 3e échec', () => {
        expect(lockoutMs(3)).toBe(15 * 60 * 1000);
        expect(lockoutMs(4)).toBe(30 * 60 * 1000);
        expect(lockoutMs(5)).toBe(60 * 60 * 1000);
        expect(lockoutMs(6)).toBe(2 * 60 * 60 * 1000);
    });

    it('plafonné à 24h', () => {
        expect(lockoutMs(10)).toBe(24 * 60 * 60 * 1000);
        expect(lockoutMs(50)).toBe(24 * 60 * 60 * 1000);
    });
});
