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
                return [d ? [{ intervention: d.intervention, role: d.role }] : [], {}];
            }

            // First admin user (demo auto-registration)
            if (q.includes('FROM dc_pos.users') && q.includes("role = 'Admin'")) return [[{ id: 42 }], {}];

            // Demo auto-registration insert
            if (q.startsWith('INSERT') && q.includes('dc_pos.devices')) {
                const key = String(params?.[1]);
                state.registeredKeys.push(key);
                state.devices[key] = { role: 'Admin', intervention: false };
                return [[], {}];
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
        // devices: public_key → { role, intervention }
        devices: {} as Record<string, { role: string | null; intervention: boolean }>,
        registeredKeys: [] as string[],
        denials: [] as { ip: string; keyPrefix: string; at: number }[],
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

import { resolveDeviceAuth, assertDeviceAuthorized, deviceKeyFromRequest } from '../src/app/api/sql/deviceAuth';
import { GET as getParametersGET } from '../src/app/api/sql/getParameters/route';

const req = (key?: string, via: 'header' | 'query' = 'header', ip?: string) =>
    new Request(`http://localhost/api/sql/test${via === 'query' && key ? `?publicKey=${key}` : ''}`, {
        headers: {
            ...(key && via === 'header' ? { 'x-public-key': key } : {}),
            ...(ip ? { 'x-forwarded-for': ip } : {}),
        },
    });

beforeEach(() => {
    state.devices = {
        'key-admin': { role: 'Admin', intervention: false },
        'key-cashier': { role: 'Caissier', intervention: false },
        'key-intervention': { role: 'Admin', intervention: true },
        'key-nouser': { role: null, intervention: false },
    };
    state.registeredKeys = [];
    state.denials = [];
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
