import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbConnection } from '../src/app/api/sql/db';

/**
 * NF525 sealed-day tests: a daily closure anchors on the day's transaction
 * hashes and totals. saveTransaction must reject any write that would break
 * the seal (409 DAY_CLOSED), and getTransactions must hide sealed-day
 * drafts so they can't resurrect on other devices.
 */

const state = vi.hoisted(() => {
    // transactions keyed by order_id
    const DRAFTS = ['EN COURS', 'EN ATTENTE', 'EN MODIF'];
    const txs = new Map<string, { id: number; method: string; day: string }>();
    const closedDays = new Set<string>();
    const closedMonths = new Set<string>(); // 'YYYY-MM-01'
    const closedYears = new Set<number>();
    const queries: string[] = [];
    const writes: string[] = [];
    const auditEvents: string[] = [];
    const today = new Date().toISOString().slice(0, 10);

    const fakeConn: DbConnection = {
        isPostgreSQL: true,
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        end: async () => {},
        query: async () => ({ rows: [{ now: new Date().toISOString() }] }),
        execute: async (query: string, params?: unknown[]) => {
            const q = query.replace(/\s+/g, ' ').trim();
            queries.push(q);
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) writes.push(q);

            // ── sealedClosedDay: existing row lookup ──
            if (q.includes('FROM dc_pos.transactions WHERE order_id') && q.includes('to_char(created_at')) {
                const tx = txs.get(String(params?.[0]));
                return [tx ? [{ payment_method: tx.method, d: tx.day }] : [], {}];
            }
            // mutation seal: earliest closure on/after the row's day
            if (q.includes('MIN(closure_date)') && q.includes('closure_date >=')) {
                const day = String(params?.[0]);
                const min = [...closedDays].filter((d) => d >= day).sort()[0] ?? null;
                return [[{ d: min }], {}];
            }
            // insert seal: exact-day closure
            if (q.includes('FROM dc_pos.daily_closures WHERE closure_date =')) {
                return [closedDays.has(String(params?.[0])) ? [{ '?column?': 1 }] : [], {}];
            }

            // ── closure-level seals (dailyClosure / periodClosure POST) ──
            if (q.includes('FROM dc_pos.monthly_closures') && q.includes('closure_month = ')) {
                return [closedMonths.has(String(params?.[0])) ? [{ id: 1 }] : [], {}];
            }
            if (q.includes('FROM dc_pos.annual_closures') && q.includes('closure_year = ')) {
                return [closedYears.has(Number(params?.[0])) ? [{ id: 1 }] : [], {}];
            }
            // Period/day aggregations must return a row — routes read [0].
            if (q.includes('COUNT(*)') && q.includes('FROM dc_pos.daily_closures')) {
                return [[{ daily_closure_count: 0, ticket_count: 0, total_amount: 0, total_ht: 0, total_tva: 0 }], {}];
            }
            if (q.includes('COUNT(*)') && q.includes('FROM dc_pos.monthly_closures')) {
                return [
                    [{ monthly_closure_count: 0, ticket_count: 0, total_amount: 0, total_ht: 0, total_tva: 0 }],
                    {},
                ];
            }
            // dailyClosure draft sweep (auto mode): drafts dated <= date
            if (q.includes('payment_method IN') && q.includes('DATE(created_at) <=') && q.includes('ORDER BY id')) {
                const date = String(params?.[0]);
                const drafts = [...txs.entries()]
                    .filter(([, t]) => DRAFTS.includes(t.method) && t.day <= date)
                    .map(([orderId, t]) => ({ id: t.id, order_id: orderId }));
                return [drafts, {}];
            }
            // sealed-ancestor check: any row after the draft in a closed day
            if (q.includes('JOIN dc_pos.daily_closures') && q.includes('t.id >=')) {
                const fromId = Number(params?.[0]);
                const hit = [...txs.values()].some((t) => t.id >= fromId && closedDays.has(t.day));
                return [hit ? [{ '?column?': 1 }] : [], {}];
            }
            // re-date UPDATE — CURRENT_TIMESTAMP lands the draft on today
            if (q.startsWith('UPDATE dc_pos.transactions') && q.includes('CURRENT_TIMESTAMP')) {
                const tx = [...txs.values()].find((t) => t.id === Number(params?.[0]));
                if (tx) tx.day = today;
                return [[], {}];
            }
            // dailyClosure draft count on the day being closed
            if (q.includes('COUNT(*) AS cnt') && q.includes('DATE(created_at)') && q.includes('payment_method IN')) {
                const date = String(params?.[0]);
                const cnt = [...txs.values()].filter((t) => DRAFTS.includes(t.method) && t.day === date).length;
                return [[{ cnt }], {}];
            }
            if (q.includes('COUNT(*)') && q.includes('FROM dc_pos.transactions')) {
                return [[{ cnt: 0, total: 0 }], {}];
            }

            // ── saveTransaction handlers ──
            // handleAddTransaction existence check (SELECT id — distinct from
            // the seal lookup which selects payment_method + created_at)
            if (q.includes('SELECT id FROM dc_pos.transactions WHERE order_id')) {
                const tx = txs.get(String(params?.[0]));
                return [tx ? [{ id: tx.id }] : [], {}];
            }
            // fetchOldFidelityData / fetchOriginalTransactionForFidelity
            // (SELECT-only — the INSERT lists fidelity_points as a column)
            if (q.startsWith('SELECT') && q.includes('fidelity_points')) return [[], {}];
            // getLatestHash
            if (q.includes('SELECT hash FROM dc_pos.transactions ORDER BY id DESC')) {
                return [[{ hash: 'tail-hash' }], {}];
            }
            // insertTransactionWithItems
            if (q.startsWith('INSERT INTO dc_pos.transactions')) return [[{ id: 999 }], {}];
            // handleUpdate/Delete/Expunge row lock
            if (q.includes('FOR UPDATE') && q.includes('order_id')) {
                const tx = txs.get(String(params?.[0]));
                return [tx ? [{ id: tx.id, previous_hash: 'prev' }] : [], {}];
            }
            // rechainFrom reads + item fetches
            if (q.includes('FROM dc_pos.transactions WHERE id >=')) {
                const tx = [...txs.values()].find((t) => t.id === Number(params?.[0]));
                return tx
                    ? [
                          [
                              {
                                  id: tx.id,
                                  order_id: 'tx-1',
                                  user_name: 'u',
                                  payment_method: tx.method,
                                  amount: 10,
                                  currency: 'EUR',
                                  change: null,
                                  device_id: null,
                                  payments: null,
                                  created_at: `${tx.day} 12:00:00`,
                                  previous_hash: 'prev',
                              },
                          ],
                          {},
                      ]
                    : [[], {}];
            }
            if (q.includes('FROM dc_pos.transaction_items')) {
                // computeDailyTotals' VAT aggregate reads rows[0]
                return q.includes('SUM(ti.total') ? [[{ tva: 0, ht: 0 }], {}] : [[], {}];
            }
            // customers fidelity lookups
            if (q.includes('customers')) return [[], {}];

            // ── getTransactions main query ──
            if (q.includes('FROM dc_pos.transactions t') && q.includes('LEFT JOIN dc.orders')) {
                // Apply the sealed-draft filter the SQL expresses:
                // NOT (draft method AND created day is closed)
                const rows = [...txs.entries()]
                    .filter(([, t]) => {
                        const isDraft = ['EN COURS', 'EN ATTENTE', 'EN MODIF'].includes(t.method);
                        return !(isDraft && closedDays.has(t.day));
                    })
                    .map(([orderId, t]) => ({
                        id: t.id,
                        order_id: orderId,
                        short_num_order: null,
                        validator: 'u',
                        method: t.method,
                        amount: 10,
                        currency: 'EUR',
                        change: null,
                        payments: null,
                        take_out: false,
                        employer_share: null,
                        deviceid: null,
                        createddate: Date.parse(`${t.day}T12:00:00Z`),
                        modifieddate: Date.parse(`${t.day}T12:00:00Z`),
                    }));
                return [rows, {}];
            }

            return [[], {}];
        },
    };
    return { txs, closedDays, closedMonths, closedYears, queries, writes, auditEvents, today, conn: fakeConn };
});

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
    authorizeDeviceOn: async () => ({ authorized: true, admin: true, intervention: false, role: 'admin' }),
}));

vi.mock('@/app/api/sql/auditHelpers', () => ({
    insertAuditEvent: async (_c: unknown, e: { event_type: string }) => {
        state.auditEvents.push(e.event_type);
    },
    lockHashChain: async () => async () => {},
    resolveAuditActor: async () => 'admin-test',
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
    withTransaction: async (_c: DbConnection, fn: () => unknown) => fn(),
    executeInsert: async () => 1,
}));

import { POST as saveTransactionPOST } from '../src/app/api/sql/saveTransaction/route';
import { GET as getTransactionsGET } from '../src/app/api/sql/getTransactions/route';
import { POST as dailyClosurePOST } from '../src/app/api/sql/dailyClosure/route';
import { POST as periodClosurePOST } from '../src/app/api/sql/periodClosure/route';

const save = (action: string, tx: Record<string, unknown>) =>
    saveTransactionPOST(
        new Request('http://localhost/api/sql/saveTransaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-public-key': 'device-key' },
            body: JSON.stringify({
                action,
                transaction: {
                    order_id: 'tx-1',
                    user_name: 'Alice',
                    payment_method: 'ESPÈCES',
                    amount: 10,
                    currency: 'EUR',
                    created_at: '2025-01-15 12:00:00',
                    updated_at: '2025-01-15 12:00:00',
                    products: [],
                    ...tx,
                },
            }),
        })
    );

const post = (url: string, body: Record<string, unknown>) =>
    new Request(`http://localhost${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-public-key': 'device-key' },
        body: JSON.stringify(body),
    });

beforeEach(() => {
    state.txs.clear();
    state.closedDays.clear();
    state.closedMonths.clear();
    state.closedYears.clear();
    state.queries.length = 0;
    state.writes.length = 0;
    state.auditEvents.length = 0;
});

describe('saveTransaction — journée clôturée (409 DAY_CLOSED)', () => {
    it('refuse la suppression d’une transaction du jour clôturé', async () => {
        state.txs.set('tx-1', { id: 1, method: 'ESPÈCES', day: '2025-01-14' });
        state.closedDays.add('2025-01-14');
        const res = await save('delete', {});
        expect(res.status).toBe(409);
        expect((await res.json()).code).toBe('DAY_CLOSED');
        expect(state.writes).toHaveLength(0);
    });

    it('refuse un expunge sur un jour clôturé', async () => {
        state.txs.set('tx-1', { id: 1, method: 'EN COURS', day: '2025-01-14' });
        state.closedDays.add('2025-01-14');
        const res = await save('expunge', {});
        expect(res.status).toBe(409);
        expect(state.writes).toHaveLength(0);
    });

    it('refuse une mutation sur un jour OUVERT quand un jour ultérieur est clôturé (rechain casse les ancres en aval)', async () => {
        // Row dated the 14th (open), but the 15th is closed — rechaining the
        // 14th rewrites the 15th's anchored hashes.
        state.txs.set('tx-1', { id: 1, method: 'ESPÈCES', day: '2025-01-14' });
        state.closedDays.add('2025-01-15');
        const res = await save('update', {});
        expect(res.status).toBe(409);
        expect(state.writes).toHaveLength(0);
    });

    it('refuse un sync qui cible une ligne d’un jour clôturé', async () => {
        state.txs.set('tx-1', { id: 1, method: 'ESPÈCES', day: '2025-01-14' });
        state.closedDays.add('2025-01-14');
        const res = await save('sync', {});
        expect(res.status).toBe(409);
        expect(state.writes).toHaveLength(0);
    });

    it('refuse l’insertion d’une nouvelle transaction datée d’un jour clôturé (falsifie les totaux)', async () => {
        state.closedDays.add('2025-01-15');
        const res = await save('add', { order_id: 'tx-new' });
        expect(res.status).toBe(409);
        expect((await res.json()).closedDay).toBe('2025-01-15');
        expect(state.writes).toHaveLength(0);
    });

    it('autorise une transaction du jour ouvert quand seule une journée antérieure est clôturée', async () => {
        state.txs.set('tx-1', { id: 1, method: 'ESPÈCES', day: '2025-01-15' });
        state.closedDays.add('2025-01-14'); // only an earlier day is sealed
        const res = await save('delete', {});
        expect(res.status).toBe(200);
    });

    it('autorise un add sur un jour ouvert (insertion normale)', async () => {
        const res = await save('add', { order_id: 'tx-new' });
        expect(res.status).toBe(200);
        expect(state.writes.some((w) => w.startsWith('INSERT INTO dc_pos.transactions'))).toBe(true);
    });

    it('une ligne SUPPRIMÉE n’ancre plus la ligne : le jour du payload gouverne', async () => {
        // Expunged row on a closed day — add/sync inserts a fresh row, so only
        // the payload date matters: today's date → allowed.
        state.txs.set('tx-1', { id: 1, method: 'SUPPRIMÉE', day: '2025-01-14' });
        state.closedDays.add('2025-01-14');
        const res = await save('add', { order_id: 'tx-1' });
        expect(res.status).toBe(200);
    });
});

describe('getTransactions — brouillons scellés exclus du sync', () => {
    it('masque les brouillons d’un jour clôturé mais garde les ventes confirmées', async () => {
        state.closedDays.add('2025-01-14');
        state.txs.set('tx-paid', { id: 1, method: 'ESPÈCES', day: '2025-01-14' });
        state.txs.set('tx-ghost', { id: 2, method: 'EN COURS', day: '2025-01-14' });
        state.txs.set('tx-draft-today', { id: 3, method: 'EN COURS', day: '2025-01-16' });
        state.txs.set('tx-paid-today', { id: 4, method: 'CB', day: '2025-01-16' });

        const res = await getTransactionsGET(
            new Request('http://localhost/api/sql/getTransactions', {
                headers: { 'x-public-key': 'device-key' },
            })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        const ids = body.transactions.map((t: { order_id?: string; createdDate: number }) => t.createdDate);

        // The sealed draft (id 2) is hidden; confirmed sealed sale (id 1) and
        // today's draft (id 3) are still returned.
        expect(state.queries.some((q) => q.includes('daily_closures'))).toBe(true);
        expect(body.transactions).toHaveLength(3);
        expect(ids).toContain(Date.parse('2025-01-14T12:00:00Z'));
        expect(ids).toContain(Date.parse('2025-01-16T12:00:00Z'));
    });
});

describe('clôtures — sceau au niveau supérieur (409)', () => {
    it('refuse une clôture journalière déjà existante', async () => {
        state.closedDays.add('2025-01-14');
        const res = await dailyClosurePOST(post('/api/sql/dailyClosure', { date: '2025-01-14', closed_by: 'a' }));
        expect(res.status).toBe(409);
        expect(state.writes.some((w) => w.includes('INSERT INTO dc_pos.daily_closures'))).toBe(false);
    });

    it('refuse une clôture journalière dans un mois déjà clôturé (ancre mensuelle)', async () => {
        state.closedMonths.add('2025-01-01');
        const res = await dailyClosurePOST(post('/api/sql/dailyClosure', { date: '2025-01-14', closed_by: 'a' }));
        expect(res.status).toBe(409);
        expect(state.writes.some((w) => w.includes('INSERT INTO dc_pos.daily_closures'))).toBe(false);
    });

    it('refuse une clôture journalière dans une année déjà clôturée', async () => {
        state.closedYears.add(2025);
        const res = await dailyClosurePOST(post('/api/sql/dailyClosure', { date: '2025-01-14', closed_by: 'a' }));
        expect(res.status).toBe(409);
        expect(state.writes.some((w) => w.includes('INSERT INTO dc_pos.daily_closures'))).toBe(false);
    });

    it('autorise une clôture journalière quand jour, mois et année sont ouverts', async () => {
        const res = await dailyClosurePOST(post('/api/sql/dailyClosure', { date: '2025-01-14', closed_by: 'a' }));
        expect(res.status).toBe(200);
        expect(state.writes.some((w) => w.startsWith('INSERT INTO dc_pos.daily_closures'))).toBe(true);
    });

    it('refuse une clôture MANUELLE quand un brouillon existe ce jour-là (PENDING_DRAFTS)', async () => {
        state.txs.set('tx-draft', { id: 1, method: 'EN ATTENTE', day: '2025-01-14' });
        const res = await dailyClosurePOST(post('/api/sql/dailyClosure', { date: '2025-01-14', closed_by: 'a' }));
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.code).toBe('PENDING_DRAFTS');
        expect(body.draftCount).toBe(1);
        expect(state.writes.some((w) => w.includes('INSERT INTO dc_pos.daily_closures'))).toBe(false);
    });

    it('clôture AUTO : redate le brouillon au jour ouvert puis clôture', async () => {
        state.txs.set('tx-draft', { id: 1, method: 'EN COURS', day: '2025-01-14' });
        const res = await dailyClosurePOST(
            post('/api/sql/dailyClosure', { date: '2025-01-14', closed_by: 'auto', auto: true })
        );
        expect(res.status).toBe(200);
        // The draft was re-dated (created_at = CURRENT_TIMESTAMP) and rechained
        expect(state.writes.some((w) => w.includes('SET created_at = CURRENT_TIMESTAMP'))).toBe(true);
        expect(state.txs.get('tx-draft')?.day).toBe(state.today);
        expect(state.writes.some((w) => w.startsWith('INSERT INTO dc_pos.daily_closures'))).toBe(true);
        expect(state.auditEvents).toContain('transaction_redated');
    });

    it('clôture AUTO : garde un brouillon dont le rechain toucherait un jour scellé → 409', async () => {
        // Draft on the day being closed, but a LATER row sits on an earlier
        // closed day — rechaining it would rewrite sealed anchors.
        state.txs.set('tx-draft', { id: 1, method: 'EN COURS', day: '2025-01-14' });
        state.txs.set('tx-sealed', { id: 2, method: 'ESPÈCES', day: '2025-01-13' });
        state.closedDays.add('2025-01-13');
        const res = await dailyClosurePOST(
            post('/api/sql/dailyClosure', { date: '2025-01-14', closed_by: 'auto', auto: true })
        );
        expect(res.status).toBe(409);
        expect((await res.json()).code).toBe('PENDING_DRAFTS');
        // The draft was NOT re-dated
        expect(state.writes.some((w) => w.includes('SET created_at = CURRENT_TIMESTAMP'))).toBe(false);
        expect(state.txs.get('tx-draft')?.day).toBe('2025-01-14');
    });

    it('clôture AUTO : redatte aussi un brouillon d\u2019un jour antérieur ouvert', async () => {
        // Straggler draft on an older open day — the sweep covers <= date.
        state.txs.set('tx-old-draft', { id: 1, method: 'EN ATTENTE', day: '2025-01-10' });
        const res = await dailyClosurePOST(
            post('/api/sql/dailyClosure', { date: '2025-01-14', closed_by: 'auto', auto: true })
        );
        expect(res.status).toBe(200);
        expect(state.txs.get('tx-old-draft')?.day).toBe(state.today);
    });

    it('refuse une clôture mensuelle dans une année déjà clôturée (ancre annuelle)', async () => {
        state.closedYears.add(2025);
        const res = await periodClosurePOST(
            post('/api/sql/periodClosure', { type: 'monthly', year: 2025, month: 1, closed_by: 'a' })
        );
        expect(res.status).toBe(409);
        expect(state.writes.some((w) => w.includes('INSERT INTO dc_pos.monthly_closures'))).toBe(false);
    });

    it('autorise une clôture mensuelle quand l’année est ouverte', async () => {
        const res = await periodClosurePOST(
            post('/api/sql/periodClosure', { type: 'monthly', year: 2025, month: 1, closed_by: 'a' })
        );
        expect(res.status).toBe(200);
        expect(state.writes.some((w) => w.startsWith('INSERT INTO dc_pos.monthly_closures'))).toBe(true);
    });
});
