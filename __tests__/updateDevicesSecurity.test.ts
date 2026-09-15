import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbConnection } from '../src/app/api/sql/db';

/**
 * Security tests for updateDevices hardening:
 * - intervention rows can't be hijacked by id or by key;
 * - a payload can never delete the calling device;
 * - the audit event is written inside the same transaction.
 */

const state = vi.hoisted(() => {
    interface DeviceRow {
        id: number;
        label: string;
        public_key: string;
        user_id: number | null;
        intervention: boolean;
    }
    const devices: DeviceRow[] = [];
    const audits: { event_type: string; detail: string | null }[] = [];
    const insideTransaction: string[] = [];
    let inTx = false;
    let nextId = 100;

    const fakeConn: DbConnection = {
        isPostgreSQL: true,
        beginTransaction: async () => {
            inTx = true;
        },
        commit: async () => {
            inTx = false;
        },
        rollback: async () => {
            inTx = false;
        },
        end: async () => {},
        query: async () => ({ rows: [] }),
        execute: async (query: string, params?: unknown[]) => {
            const q = query.replace(/\s+/g, ' ');
            if (inTx) insideTransaction.push(q);

            // Billable device count
            if (q.includes('COUNT(*)') && q.includes('dc_pos.devices')) {
                return [[{ count: devices.filter((d) => !d.intervention).length }], {}];
            }

            // Update by id — `AND NOT intervention` protects service rows.
            if (q.startsWith('UPDATE dc_pos.devices SET label') && q.includes('AND NOT intervention')) {
                const id = Number(params?.[9]);
                const d = devices.find((x) => x.id === id && !x.intervention);
                if (d) {
                    d.label = String(params?.[0]);
                    d.public_key = String(params?.[1]);
                    d.user_id = params?.[2] as number | null;
                }
                return [d ? [{ id }] : [], {}];
            }

            // Lookup by public key — exposes the intervention flag so the
            // route can refuse to touch service rows.
            if (q.includes('SELECT id, intervention FROM dc_pos.devices WHERE public_key')) {
                const d = devices.find((x) => x.public_key === String(params?.[0]));
                return [d ? [{ id: d.id, intervention: d.intervention }] : [], {}];
            }

            // Update existing non-intervention row (key-lookup path)
            if (q.startsWith('UPDATE dc_pos.devices SET label') && q.includes('WHERE id =')) {
                const id = Number(params?.[8]);
                const d = devices.find((x) => x.id === id && !x.intervention);
                if (d) {
                    d.label = String(params?.[0]);
                    d.user_id = params?.[1] as number | null;
                }
                return [[], {}];
            }

            // Insert new device
            if (q.startsWith('INSERT INTO dc_pos.devices')) {
                const id = nextId++;
                devices.push({
                    id,
                    label: String(params?.[0]),
                    public_key: String(params?.[1]),
                    user_id: params?.[2] as number | null,
                    intervention: false,
                });
                return [[{ id }], {}];
            }

            // Delete — simulate `WHERE NOT intervention AND id NOT IN (…) AND id <> caller`
            if (q.startsWith('DELETE FROM dc_pos.devices')) {
                const keep = new Set<number>((params ?? []).map((p) => Number(p)));
                for (let i = devices.length - 1; i >= 0; i--) {
                    if (!devices[i].intervention && !keep.has(devices[i].id)) devices.splice(i, 1);
                }
                return [[], {}];
            }

            // Audit event insert — record whether it ran inside the tx
            if (q.startsWith('INSERT INTO dc_pos.audit_events')) {
                audits.push({ event_type: String(params?.[0]), detail: String(params?.[5]) });
                return [[], {}];
            }

            return [[], {}];
        },
    };
    return { devices, audits, insideTransaction, conn: fakeConn };
});

vi.mock('@/app/constants/shop', () => ({
    getShopIdFromRequest: () => 'test-shop',
    getShopIdFromHostname: () => 'test-shop',
    getShopFromHostname: () => 'test-shop',
    getShopFromSubdomain: () => 'test-shop',
    SHOP_ID: 'test-shop',
    fetchShopId: async () => 'test-shop',
}));

// The caller is device id 1 (a normal caisse).
vi.mock('@/app/api/sql/deviceAuth', () => ({
    authorizeDeviceOn: async () => ({
        authorized: true,
        admin: true,
        intervention: false,
        role: 'admin',
        deviceId: 1,
    }),
    resolveUserSession: async () => null,
}));

vi.mock('@/app/api/sql/subscriptionStore', () => ({
    readSubscription: async () => ({ plan: 'privilege', status: 'active', billing_method: 'transfer' }),
    subscriptionStopped: async () => false,
    stoppedSubscriptionResponse: () => new Response(JSON.stringify({ error: 'Abonnement suspendu' }), { status: 402 }),
}));

vi.mock('@/app/api/sql/db', () => ({
    getPosDb: async () => state.conn,
    getMainDb: async () => state.conn,
    withPosDb: async (_shopId: string | undefined, fn: (c: DbConnection) => unknown) => fn(state.conn),
    withTransaction: async (c: DbConnection, fn: () => unknown) => {
        await c.beginTransaction();
        const result = await fn();
        await c.commit();
        return result;
    },
    executeInsert: async (_c: DbConnection, _pg: string, _m: string, params: unknown[]) => {
        const id = 100 + state.devices.length;
        state.devices.push({
            id,
            label: String(params?.[0]),
            public_key: String(params?.[1]),
            user_id: params?.[2] as number | null,
            intervention: false,
        });
        return id;
    },
}));

// insertAuditEvent goes through the connection — the fake conn records it.
vi.mock('@/app/api/sql/auditHelpers', () => ({
    insertAuditEvent: async (c: DbConnection, event: { event_type: string; detail?: string | null }) => {
        await c.execute(
            'INSERT INTO dc_pos.audit_events (event_type, entity_type, entity_id, user_name, device_id, detail) VALUES ($1,$2,$3,$4,$5,$6)',
            [event.event_type, 'devices', 'devices', 'tester', null, event.detail ?? null]
        );
    },
    resolveAuditActor: async () => 'tester',
    lockHashChain: async () => async () => {},
}));

import { POST as updateDevicesPOST } from '../src/app/api/sql/updateDevices/route';

const post = (devices: unknown[]) =>
    updateDevicesPOST(
        new Request('http://localhost/api/sql/updateDevices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-public-key': 'key-1' },
            body: JSON.stringify({ devices }),
        })
    );

beforeEach(() => {
    state.devices.length = 0;
    state.devices.push(
        { id: 1, label: 'Caisse 1', public_key: 'key-1', user_id: 1, intervention: false },
        { id: 2, label: 'Support', public_key: 'support-key', user_id: null, intervention: true },
        { id: 3, label: 'Caisse 2', public_key: 'key-3', user_id: 2, intervention: false }
    );
    state.audits.length = 0;
    state.insideTransaction.length = 0;
});

describe('updateDevices — protection des appareils intervention', () => {
    it('ne peut pas détourner une ligne intervention par id', async () => {
        const res = await post([{ id: 2, label: 'Piraté', key: 'attacker-key', userId: 99 }]);
        expect(res.status).toBe(200);
        const support = state.devices.find((d) => d.id === 2)!;
        // Row untouched — the `AND NOT intervention` filter matched nothing.
        expect(support.public_key).toBe('support-key');
        expect(support.label).toBe('Support');
        expect(support.intervention).toBe(true);
    });

    it('ne peut pas détourner une ligne intervention par clé', async () => {
        // No id → lookup by key finds the intervention row → must be skipped
        // (not updated, not duplicated).
        const res = await post([{ label: 'Piraté', key: 'support-key', userId: 99 }]);
        expect(res.status).toBe(200);
        const support = state.devices.find((d) => d.id === 2)!;
        expect(support.user_id).toBeNull();
        expect(support.label).toBe('Support');
        // No duplicate row created for the key
        expect(state.devices.filter((d) => d.public_key === 'support-key')).toHaveLength(1);
    });

    it('un flag intervention forgé dans le body ne crée pas de ligne cachée', async () => {
        const res = await post([{ label: 'Faux support', key: 'fake-intervention', userId: 1, intervention: true }]);
        expect(res.status).toBe(200);
        const created = state.devices.find((d) => d.public_key === 'fake-intervention');
        // Inserted (if at all) as a NORMAL device — the flag is never trusted.
        if (created) expect(created.intervention).toBe(false);
    });
});

describe('updateDevices — protection de l’appareil appelant et audit', () => {
    it('devices: [] conserve l’appareil appelant et les lignes intervention', async () => {
        const res = await post([]);
        expect(res.status).toBe(200);
        const remaining = state.devices.map((d) => d.id).sort();
        expect(remaining).toEqual([1, 2]); // caller + intervention
    });

    it('la suppression massive épargne aussi l’appelant quand la liste est vide', async () => {
        await post([]);
        expect(state.devices.find((d) => d.id === 1)?.public_key).toBe('key-1');
        expect(state.devices.find((d) => d.id === 2)?.intervention).toBe(true);
    });

    it('l’événement d’audit est écrit dans la même transaction', async () => {
        const res = await post([{ id: 3, label: 'Caisse 2bis', key: 'key-3' }]);
        expect(res.status).toBe(200);
        expect(state.audits).toHaveLength(1);
        expect(state.audits[0].event_type).toBe('device_change');
        // The audit INSERT ran while the transaction was open.
        expect(state.insideTransaction.some((q) => q.includes('audit_events'))).toBe(true);
    });
});
