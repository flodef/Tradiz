import { describe, expect, it } from 'vitest';
import {
    computeMonthlyBill,
    SUBSCRIPTION_PLANS,
    FEATURE_MATRIX,
    PLAN_ORDER,
    type SubscriptionEvent,
} from '../src/app/utils/subscription';

const ev = (day: number, type: SubscriptionEvent['event_type'], plan: SubscriptionEvent['plan'], hour = 12) =>
    ({ event_type: type, plan, created_at: new Date(2025, 5, day, hour) }) satisfies SubscriptionEvent;

describe('computeMonthlyBill (June 2025 = 30 days)', () => {
    it('full month on one plan bills the full monthly price', () => {
        const bill = computeMonthlyBill([ev(1, 'start', 'decouverte', 0)], 2025, 6);
        expect(bill.total).toBe(30);
        expect(bill.days).toHaveLength(30);
        expect(bill.days.every((d) => d.plan === 'decouverte')).toBe(true);
    });

    it('matches the spec example: 30€×10j + stop×5j + 100€×15j = 60€', () => {
        const events: SubscriptionEvent[] = [
            ev(1, 'start', 'decouverte', 0),
            ev(11, 'stop', null, 0),
            ev(16, 'start', 'privilege', 0),
        ];
        const bill = computeMonthlyBill(events, 2025, 6);
        // 30/30*10 + 0*5 + 100/30*15 = 10 + 0 + 50 = 60
        expect(bill.total).toBe(60);
        expect(bill.days[9].plan).toBe('decouverte');
        expect(bill.days[10].plan).toBeNull();
        expect(bill.days[15].plan).toBe('privilege');
    });

    it('bills the most expensive plan used during a same-day sequence', () => {
        const events: SubscriptionEvent[] = [
            ev(10, 'start', 'privilege', 9), // 100€ in the morning
            ev(10, 'plan_change', 'decouverte', 14), // downgrade to 30€
            ev(10, 'stop', null, 18), // stopped in the evening
        ];
        const bill = computeMonthlyBill(events, 2025, 6);
        expect(bill.days[9].plan).toBe('privilege');
        expect(bill.days[9].price).toBeCloseTo(100 / 30, 2); // rounded for display
        expect(bill.days[10].plan).toBeNull();
        expect(bill.days[10].price).toBe(0);
    });

    it('same-day upgrade then stop still bills the upgrade day', () => {
        const events: SubscriptionEvent[] = [
            ev(1, 'start', 'decouverte', 0),
            ev(20, 'plan_change', 'pro', 10),
            ev(20, 'stop', null, 22),
        ];
        const bill = computeMonthlyBill(events, 2025, 6);
        expect(bill.days[19].plan).toBe('pro'); // highest plan of day 20
        expect(bill.days[20].plan).toBeNull();
    });

    it('no events bills nothing', () => {
        const bill = computeMonthlyBill([], 2025, 6);
        expect(bill.total).toBe(0);
        expect(bill.days.every((d) => d.plan === null)).toBe(true);
    });

    it('events from a previous month carry over as the running state', () => {
        const events: SubscriptionEvent[] = [{ event_type: 'start', plan: 'pro', created_at: new Date(2025, 4, 15) }];
        const bill = computeMonthlyBill(events, 2025, 6);
        expect(bill.total).toBe(50);
    });

    it('uses a fixed 30-day divisor but caps at the monthly price in a 31-day month', () => {
        const events: SubscriptionEvent[] = [
            { event_type: 'start', plan: 'decouverte', created_at: new Date(2025, 6, 1, 0) },
        ];
        const bill = computeMonthlyBill(events, 2025, 7);
        expect(bill.days).toHaveLength(31);
        expect(bill.days[0].price).toBe(1); // 30/30
        expect(bill.total).toBe(30); // capped: never more than the plan's monthly price
    });

    it('only bills elapsed days when the month is the current one', () => {
        const today = new Date(2025, 5, 10, 15); // June 10th
        const events: SubscriptionEvent[] = [{ event_type: 'start', plan: 'pro', created_at: new Date(2025, 5, 1, 0) }];
        const bill = computeMonthlyBill(events, 2025, 6, today);
        expect(bill.days).toHaveLength(10);
        expect(bill.total).toBeCloseTo((50 / 30) * 10, 2);
    });

    it('ignores malformed event dates instead of corrupting the month', () => {
        const events: SubscriptionEvent[] = [
            ev(1, 'start', 'decouverte', 0),
            { event_type: 'plan_change', plan: 'privilege', created_at: 'not-a-date' },
        ];
        const bill = computeMonthlyBill(events, 2025, 6, new Date(2025, 6, 1));
        expect(bill.total).toBe(30);
    });

    it('ignores invalid plan strings stored by manual edits', () => {
        const events = [
            { event_type: 'start', plan: 'decouverte', created_at: new Date(2025, 5, 1) },
            { event_type: 'plan_change', plan: 'bogus-plan', created_at: new Date(2025, 5, 10) },
        ] as unknown as SubscriptionEvent[];
        const bill = computeMonthlyBill(events, 2025, 6);
        expect(bill.days[9].plan).toBeNull(); // bogus → treated as stopped
        expect(bill.total).toBeCloseTo(9, 2);
    });
});

describe('plan definitions', () => {
    it('keeps the landing prices in sync', () => {
        expect(SUBSCRIPTION_PLANS.decouverte.monthlyPrice).toBe(30);
        expect(SUBSCRIPTION_PLANS.pro.monthlyPrice).toBe(50);
        expect(SUBSCRIPTION_PLANS.privilege.monthlyPrice).toBe(100);
    });

    it('enforces Découverte limits', () => {
        const l = SUBSCRIPTION_PLANS.decouverte.limits;
        expect(l.maxDevices).toBe(1);
        expect(l.maxProducts).toBe(50);
        expect(l.maxCurrencies).toBe(1);
        expect(l.customers).toBe(false);
        expect(l.stats).toBe(false);
        expect(l.onlineSite).toBe(false);
        expect(l.companies).toBe(false);
    });

    it('feature matrix covers all three plans in PLAN_ORDER', () => {
        expect(PLAN_ORDER).toEqual(['decouverte', 'pro', 'privilege']);
        for (const row of FEATURE_MATRIX) {
            expect(row.values).toHaveLength(3);
        }
    });
});
