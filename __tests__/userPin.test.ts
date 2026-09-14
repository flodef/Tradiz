import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbConnection } from '../src/app/api/sql/db';

/**
 * Tests for the per-user PIN: scrypt hashing, the verifyUserPin endpoint
 * (device-gated + IP rate-limited) and updateUsers pin/clearPin handling.
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

            // resolveDeviceAuth — every presented key is a registered admin device
            if (q.includes('FROM dc_pos.devices d') && q.includes('public_key')) {
                return [[{ intervention: false, role: 'Admin' }], {}];
            }

            // PIN rate-limit counter (failures matching IP or user_id)
            if (q.includes('COUNT(*)') && q.includes('dc_sys.connections') && q.includes('pin_attempt')) {
                const ip = String(params?.[1]);
                const userId = Number(params?.[2]);
                const count = state.pinAttempts.filter(
                    (a) => !a.success && (a.ip === ip || a.userId === userId)
                ).length;
                return [[{ count }], {}];
            }

            // Denial-throttle queries (assertDeviceAuthorized on failure)
            if (q.includes('COUNT(*)') && q.includes('dc_sys.connections')) return [[{ count: 0 }], {}];
            if (q.startsWith('SELECT 1 FROM dc_sys.connections')) return [[], {}];

            // Log writes (pin_attempt / device_denied)
            if (q.startsWith('INSERT') && q.includes('dc_sys.connections')) {
                const meta = JSON.parse(String(params?.[2]));
                if (meta.type === 'pin_attempt') {
                    state.pinAttempts.push({ ip: meta.ip_address, userId: meta.user_id, success: meta.success });
                }
                return [[], {}];
            }

            // users.pin_hash lookup (verifyUserPin)
            if (q.includes('SELECT pin_hash FROM dc_pos.users')) {
                const userId = Number(params?.[0]);
                const user = state.users.find((u) => u.id === userId);
                return [user ? [{ pin_hash: user.pin_hash }] : [], {}];
            }

            // updateUsers — track pin writes
            if (q.startsWith('UPDATE dc_pos.users SET pin_hash')) {
                state.pinWrites.push({ userId: Number(params?.[1] ?? params?.[0]), hash: String(params?.[0]) });
                return [[], {}];
            }
            if (q.startsWith('UPDATE dc_pos.users')) return [[], {}];
            if (q.startsWith('SELECT id FROM dc_pos.users WHERE reference')) return [[], {}];
            if (q.includes('FROM dc_pos.users u') && q.includes('NOT EXISTS')) {
                return [
                    state.users.map((u) => ({
                        id: u.id,
                        name: u.name,
                        role: u.role,
                        reference: u.reference,
                        pin_hash: u.pin_hash,
                    })),
                    {},
                ];
            }
            if (q.startsWith('DELETE FROM dc_pos.users')) return [[], {}];
            if (q.startsWith('INSERT INTO dc_pos.audit_events')) return [[], {}];
            if (q.includes('subscription')) return [[], {}];

            return [[], {}];
        },
    };
    return {
        users: [] as { id: number; name: string; role: string; reference?: string; pin_hash: string | null }[],
        pinAttempts: [] as { ip: string; userId: number; success: boolean }[],
        pinWrites: [] as { userId: number; hash: string }[],
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
    executeInsert: async () => 99,
}));

vi.mock('@/app/api/sql/subscriptionStore', () => ({
    subscriptionStopped: async () => false,
    stoppedSubscriptionResponse: () => new Response(null, { status: 402 }),
}));

vi.mock('@/app/api/sql/auditHelpers', () => ({
    insertAuditEvent: async () => {},
}));

import { hashPin, verifyPin } from '../src/app/api/sql/pinHash';
import { POST as verifyUserPinPOST } from '../src/app/api/sql/verifyUserPin/route';
import { POST as updateUsersPOST } from '../src/app/api/sql/updateUsers/route';

const pinReq = (body: unknown, ip = '1.2.3.4') =>
    new Request('http://localhost/api/sql/verifyUserPin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-public-key': 'device-key', 'x-forwarded-for': ip },
        body: JSON.stringify(body),
    });

beforeEach(async () => {
    state.users = [{ id: 1, name: 'Alice', role: 'Caissier', pin_hash: await hashPin('1234') }];
    state.pinAttempts = [];
    state.pinWrites = [];
});

describe('pinHash', () => {
    it('hash + vérifie un PIN correct', async () => {
        const stored = await hashPin('4321');
        expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
        expect(await verifyPin('4321', stored)).toBe(true);
    });

    it('rejette un PIN incorrect', async () => {
        const stored = await hashPin('4321');
        expect(await verifyPin('0000', stored)).toBe(false);
    });

    it('rejette un hash malformé', async () => {
        expect(await verifyPin('1234', 'garbage')).toBe(false);
        expect(await verifyPin('1234', '')).toBe(false);
    });
});

describe('POST /api/sql/verifyUserPin', () => {
    it('403 sans clé appareil', async () => {
        const req = new Request('http://localhost/api/sql/verifyUserPin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: 1, pin: '1234' }),
        });
        const res = await verifyUserPinPOST(req);
        expect(res.status).toBe(403);
    });

    it('400 sur payload invalide', async () => {
        expect((await verifyUserPinPOST(pinReq({ pin: '1234' }))).status).toBe(400);
        expect((await verifyUserPinPOST(pinReq({ userId: 1 }))).status).toBe(400);
        expect((await verifyUserPinPOST(pinReq({ userId: 'abc', pin: '1234' }))).status).toBe(400);
    });

    it('200 sur le bon PIN, 401 sur un mauvais', async () => {
        expect((await verifyUserPinPOST(pinReq({ userId: 1, pin: '1234' }))).status).toBe(200);
        const bad = await verifyUserPinPOST(pinReq({ userId: 1, pin: '9999' }));
        expect(bad.status).toBe(401);
    });

    it('401 pour un utilisateur sans PIN ou inexistant', async () => {
        state.users.push({ id: 2, name: 'Bob', role: 'Service', pin_hash: null });
        expect((await verifyUserPinPOST(pinReq({ userId: 2, pin: '1234' }))).status).toBe(401);
        expect((await verifyUserPinPOST(pinReq({ userId: 999, pin: '1234' }))).status).toBe(401);
    });

    it('429 après 5 échecs en 15 min', async () => {
        for (let i = 0; i < 5; i++) {
            state.pinAttempts.push({ ip: '9.9.9.9', userId: 1, success: false });
        }
        const res = await verifyUserPinPOST(pinReq({ userId: 1, pin: '1234' }, '9.9.9.9'));
        expect(res.status).toBe(429);
    });

    it('les échecs sont journalisés sans le PIN', async () => {
        await verifyUserPinPOST(pinReq({ userId: 1, pin: '9999' }));
        expect(state.pinAttempts).toHaveLength(1);
        expect(state.pinAttempts[0]).toMatchObject({ ip: '1.2.3.4', userId: 1, success: false });
    });
});

describe('updateUsers — PIN', () => {
    const updateReq = (users: unknown[]) =>
        new Request('http://localhost/api/sql/updateUsers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-public-key': 'device-key' },
            body: JSON.stringify({ users }),
        });

    it('rejette un PIN invalide (non numérique / trop court)', async () => {
        const res = await updateUsersPOST(updateReq([{ id: 1, name: 'Alice', role: 'Caissier', pin: '12' }]));
        expect(res.status).toBe(400);
        const res2 = await updateUsersPOST(updateReq([{ id: 1, name: 'Alice', role: 'Caissier', pin: '12ab' }]));
        expect(res2.status).toBe(400);
    });

    it('hash et stocke un nouveau PIN', async () => {
        const res = await updateUsersPOST(updateReq([{ id: 1, name: 'Alice', role: 'Caissier', pin: '5678' }]));
        expect(res.status).toBe(200);
        expect(state.pinWrites).toHaveLength(1);
        expect(state.pinWrites[0].userId).toBe(1);
        expect(state.pinWrites[0].hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
        expect(state.pinWrites[0].hash).not.toContain('5678');
        expect(await verifyPin('5678', state.pinWrites[0].hash)).toBe(true);
    });

    it('clearPin efface le hash', async () => {
        const res = await updateUsersPOST(updateReq([{ id: 1, name: 'Alice', role: 'Caissier', clearPin: true }]));
        expect(res.status).toBe(200);
        expect(state.pinWrites).toHaveLength(1);
        // NULL update — first param is the id for the `pin_hash = NULL` statement
    });

    it('sans pin/clearPin le hash existant est conservé (pas de write)', async () => {
        const res = await updateUsersPOST(updateReq([{ id: 1, name: 'Alice', role: 'Caissier' }]));
        expect(res.status).toBe(200);
        expect(state.pinWrites).toHaveLength(0);
    });

    it('retourne hasPin sans exposer le hash', async () => {
        const res = await updateUsersPOST(updateReq([{ id: 1, name: 'Alice', role: 'Caissier' }]));
        const body = await res.json();
        expect(body.users[0].hasPin).toBe(true);
        expect(JSON.stringify(body)).not.toContain('pin_hash');
        expect(JSON.stringify(body)).not.toContain(state.users[0].pin_hash!.split(':')[0]);
    });
});
