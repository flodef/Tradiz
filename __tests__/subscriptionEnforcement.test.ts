import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbConnection } from '../src/app/api/sql/db';

/**
 * Route-level tests for plan enforcement and the subscription daily-change
 * quota. The DB layer is replaced by a stateful fake that simulates the
 * `subscription` / `subscription_events` tables and returns generic empty
 * rows for everything else.
 */

const state = vi.hoisted(() => ({
    sub: { plan: 'privilege', status: 'active', billing_method: 'transfer' },
    eventsToday: 0,
    hasEvents: true,
    productCount: 0,
    queries: [] as string[],
}));

vi.mock('@/app/constants/shop', () => ({
    getShopIdFromRequest: () => 'test-shop',
    getShopIdFromHostname: () => 'test-shop',
    getShopFromHostname: () => 'test-shop',
    getShopFromSubdomain: () => 'test-shop',
    SHOP_ID: 'test-shop',
    fetchShopId: async () => 'test-shop',
}));

vi.mock('@/app/api/sql/deviceAuth', () => ({
    assertDeviceAuthorized: async () => null,
    resolveDeviceAuth: async () => ({ authorized: true, admin: true, intervention: false, role: 'admin' }),
}));

vi.mock('@/app/api/sql/auditHelpers', () => ({
    insertAuditEvent: async () => {},
    lockHashChain: async () => async () => {},
}));

vi.mock('@/app/api/sql/db', () => {
    const conn: DbConnection = {
        isPostgreSQL: true,
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        end: async () => {},
        query: async () => ({ rows: [] }),
        execute: async (query: string, params?: unknown[]) => {
            state.queries.push(query);
            const q = query.replace(/\s+/g, ' ');

            // Daily quota counter (subscription route)
            if (q.includes('COUNT(*)') && q.includes('subscription_events'))
                return [[{ c: String(state.eventsToday) }], {}];
            if (q.startsWith('INSERT') && q.includes('subscription_events')) {
                state.eventsToday++;
                return [[], {}];
            }
            if (q.includes('FROM dc_pos.subscription_events')) return state.hasEvents ? [[{ x: 1 }], {}] : [[], {}];

            // Singleton subscription row
            if (q.includes('FROM dc_pos.subscription WHERE id = 1')) return [[{ ...state.sub }], {}];
            if (q.includes("SET status = 'stopped'")) {
                state.sub.status = 'stopped';
                return [[], {}];
            }
            if (q.includes("SET status = 'active'")) {
                state.sub.status = 'active';
                state.sub.plan = String(params?.[0] ?? state.sub.plan);
                return [[], {}];
            }
            if (q.includes('UPDATE dc_pos.subscription SET plan =')) {
                state.sub.plan = String(params?.[0]);
                return [[], {}];
            }
            if (q.includes('SET billing_method')) {
                state.sub.billing_method = String(params?.[0]);
                return [[], {}];
            }

            // updateArticles support: categories map + post-save product count
            if (q.includes('FROM dc.categories'))
                return [
                    [
                        { id: 1, name: 'Boissons' },
                        { id: 2, name: 'Plats' },
                    ],
                    {},
                ];
            if (q.includes('COUNT(*)') && q.includes('dc.products')) return [[{ c: String(state.productCount) }], {}];

            // Any INSERT ... RETURNING id (customers, companies, devices…)
            if (q.startsWith('INSERT') && q.toUpperCase().includes('RETURNING')) return [[{ id: 1 }], {}];

            return [[], {}];
        },
    };
    return {
        getPosDb: async () => conn,
        getMainDb: async () => conn,
        withPosDb: async (_shopId: string | undefined, fn: (c: DbConnection) => unknown) => fn(conn),
        withTransaction: async (_c: DbConnection, fn: () => unknown) => fn(),
        executeInsert: async () => 1,
    };
});

// Imports must come after the mocks — vitest hoists vi.mock anyway.
import { POST as subscriptionPOST } from '../src/app/api/sql/subscription/route';
import { POST as updateDevicesPOST } from '../src/app/api/sql/updateDevices/route';
import { POST as updateArticlesPOST } from '../src/app/api/sql/updateArticles/route';
import { POST as updateCustomersPOST } from '../src/app/api/sql/updateCustomers/route';
import { POST as updateCompaniesPOST } from '../src/app/api/sql/updateCompanies/route';
import { GET as getStatisticsGET } from '../src/app/api/sql/getStatistics/route';
import { fetchCatalog } from '../src/app/api/public/catalog/fetchCatalog';

const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
    handler(
        new Request('http://localhost/api/sql/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
    );

const sub = (body: unknown) => post(subscriptionPOST, body);

const setSub = (plan: string, status = 'active', eventsToday = 0) => {
    state.sub = { plan, status, billing_method: 'transfer' };
    state.eventsToday = eventsToday;
    state.hasEvents = true;
};

beforeEach(() => {
    setSub('privilege');
    state.productCount = 0;
    state.queries = [];
});

describe('POST /api/sql/subscription — quota de 3 changements par jour', () => {
    it('autorise 3 changements puis refuse le 4e avec un 429', async () => {
        setSub('privilege');

        expect((await sub({ action: 'stop' })).status).toBe(200);
        expect(state.sub.status).toBe('stopped');

        expect((await sub({ action: 'start', plan: 'pro' })).status).toBe(200);
        expect(state.sub.status).toBe('active');
        expect(state.sub.plan).toBe('pro');

        expect((await sub({ action: 'plan_change', plan: 'decouverte' })).status).toBe(200);
        expect(state.sub.plan).toBe('decouverte');

        // 4th valid change → 429, nothing written
        const res = await sub({ action: 'plan_change', plan: 'pro' });
        expect(res.status).toBe(429);
        expect(state.sub.plan).toBe('decouverte');
        expect(state.eventsToday).toBe(3);
    });

    it('le quota tient compte des changements déjà enregistrés le jour même', async () => {
        setSub('privilege', 'active', 3); // 3 events already logged today
        const res = await sub({ action: 'stop' });
        expect(res.status).toBe(429);
        expect(state.sub.status).toBe('active');
    });

    it('billing_method ne consomme pas le quota', async () => {
        setSub('privilege', 'active', 3); // quota already exhausted
        expect((await sub({ action: 'billing_method', billing_method: 'card' })).status).toBe(200);
        expect((await sub({ action: 'billing_method', billing_method: 'transfer' })).status).toBe(200);
        expect(state.sub.billing_method).toBe('transfer');
    });

    it('les actions invalides/redondantes gardent leur code métier, pas un 429', async () => {
        setSub('privilege', 'active', 3); // quota exhausted
        expect((await sub({ action: 'start' })).status).toBe(409); // already active
        expect((await sub({ action: 'plan_change', plan: 'privilege' })).status).toBe(409); // same plan
        expect((await sub({ action: 'plan_change', plan: 'nope' })).status).toBe(400); // invalid plan
        expect((await sub({ action: 'bogus' })).status).toBe(400); // unknown action
        expect((await sub({})).status).toBe(400); // missing action
    });

    it('stop sur abonnement déjà arrêté → 409 ; plan_change quand arrêté → 409', async () => {
        setSub('privilege', 'stopped');
        expect((await sub({ action: 'stop' })).status).toBe(409);
        expect((await sub({ action: 'plan_change', plan: 'pro' })).status).toBe(409);
        // start reste autorisé (c'est la reprise d'abonnement)
        expect((await sub({ action: 'start' })).status).toBe(200);
        expect(state.sub.status).toBe('active');
    });
});

describe('Limites de formule côté serveur', () => {
    const device = (n: number) => ({ id: n, label: `Caisse ${n}`, key: `key-${n}` });
    const product = (name: string, extra: Record<string, unknown> = {}) => ({
        name,
        category: 'Boissons',
        stock: 1,
        currencies: ['1.00'],
        ...extra,
    });

    it('Découverte : updateDevices refuse plus de 1 appareil', async () => {
        setSub('decouverte');
        const res = await post(updateDevicesPOST, { devices: [device(1), device(2)] });
        expect(res.status).toBe(403);
        expect((await res.json()).error).toMatch(/limitée à 1 caisse/);

        // 1 device is fine
        expect((await post(updateDevicesPOST, { devices: [device(1)] })).status).toBe(200);
    });

    it('Pro : updateDevices refuse plus de 2 appareils', async () => {
        setSub('pro');
        expect((await post(updateDevicesPOST, { devices: [device(1), device(2)] })).status).toBe(200);
        expect((await post(updateDevicesPOST, { devices: [device(1), device(2), device(3)] })).status).toBe(403);
    });

    it('Découverte : updateArticles refuse un catalogue > 50 produits', async () => {
        setSub('decouverte');
        state.productCount = 51; // what the table would contain after the save
        const products = Array.from({ length: 51 }, (_, i) => product(`P${i}`));
        const res = await post(updateArticlesPOST, { products });
        expect(res.status).toBe(403);
        expect((await res.json()).error).toMatch(/limitée à 50 produits/);
    });

    it('Pro : pas de limite produits', async () => {
        setSub('pro');
        state.productCount = 51;
        const products = Array.from({ length: 51 }, (_, i) => product(`P${i}`));
        expect((await post(updateArticlesPOST, { products })).status).toBe(200);
    });

    it('quote part employeur réservée à Privilège', async () => {
        setSub('pro');
        const res = await post(updateArticlesPOST, { products: [product('Ticket resto', { employerShare: 50 })] });
        expect(res.status).toBe(403);
        setSub('privilege');
        state.productCount = 1;
        expect(
            (await post(updateArticlesPOST, { products: [product('Ticket resto', { employerShare: 50 })] })).status
        ).toBe(200);
    });

    it('Découverte : gestion des clients refusée (update + add)', async () => {
        setSub('decouverte');
        const res = await post(updateCustomersPOST, { customers: [{ firstName: 'A', lastName: 'B' }] });
        expect(res.status).toBe(403);
        expect((await res.json()).error).toMatch(/Pro ou Privilège/);
    });

    it('Pro : gestion des clients autorisée', async () => {
        setSub('pro');
        expect((await post(updateCustomersPOST, { customers: [{ firstName: 'A', lastName: 'B' }] })).status).toBe(200);
    });

    it('Entreprises : réservé à Privilège', async () => {
        setSub('pro');
        expect((await post(updateCompaniesPOST, { companies: [{ name: 'X', employerShare: 50 }] })).status).toBe(403);
        setSub('privilege');
        expect((await post(updateCompaniesPOST, { companies: [] })).status).toBe(200);
    });

    it('Découverte : statistiques refusées', async () => {
        setSub('decouverte');
        const res = await getStatisticsGET(new Request('http://localhost/api/sql/getStatistics'));
        expect(res.status).toBe(403);
    });

    it('Découverte : catalogue public (site externe) refusé ; arrêté aussi', async () => {
        setSub('decouverte');
        expect((await fetchCatalog('test-shop')).status).toBe(403);
        setSub('privilege', 'stopped');
        expect((await fetchCatalog('test-shop')).status).toBe(403);
    });
});
