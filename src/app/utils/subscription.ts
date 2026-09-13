// Subscription plans — source of truth shared between the landing page, the
// POS admin (CommerceConfig) and the API routes enforcing the limits.
//
// Billing model: monthly price prorated by day over a fixed 30-day month.
// Each day is billed at the highest plan active at any point during that
// day; days with no active subscription are free.
// Month invoice = Σ(day price) where day price = monthlyPrice / 30.

export type SubscriptionPlan = 'decouverte' | 'pro' | 'privilege';
export type SubscriptionStatus = 'active' | 'stopped';
export type BillingMethod = 'revolut' | 'invoice';

export interface PlanLimits {
    maxDevices: number;
    maxProducts: number;
    maxCurrencies: number;
    customers: boolean;
    stats: boolean;
    onlineSite: boolean;
    companies: boolean;
    employerShare: boolean;
    advancedCustomization: boolean;
}

export interface PlanDefinition {
    id: SubscriptionPlan;
    name: string;
    monthlyPrice: number;
    limits: PlanLimits;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, PlanDefinition> = {
    decouverte: {
        id: 'decouverte',
        name: 'Découverte',
        monthlyPrice: 30,
        limits: {
            maxDevices: 1,
            maxProducts: 50,
            maxCurrencies: 1,
            customers: false,
            stats: false,
            onlineSite: false,
            companies: false,
            employerShare: false,
            advancedCustomization: false,
        },
    },
    pro: {
        id: 'pro',
        name: 'Pro',
        monthlyPrice: 50,
        limits: {
            maxDevices: 2,
            maxProducts: Infinity,
            maxCurrencies: Infinity,
            customers: true,
            stats: true,
            onlineSite: true,
            companies: false,
            employerShare: false,
            advancedCustomization: false,
        },
    },
    privilege: {
        id: 'privilege',
        name: 'Privilège',
        monthlyPrice: 100,
        limits: {
            maxDevices: Infinity,
            maxProducts: Infinity,
            maxCurrencies: Infinity,
            customers: true,
            stats: true,
            onlineSite: true,
            companies: true,
            employerShare: true,
            advancedCustomization: true,
        },
    },
};

export const PLAN_ORDER: SubscriptionPlan[] = ['decouverte', 'pro', 'privilege'];

export function isSubscriptionPlan(value: unknown): value is SubscriptionPlan {
    return typeof value === 'string' && value in SUBSCRIPTION_PLANS;
}

// Rows of the comparative feature table (CommerceConfig tooltip + landing).
export type FeatureValue = boolean | string;
export const FEATURE_MATRIX: { label: string; values: [FeatureValue, FeatureValue, FeatureValue] }[] = [
    { label: 'Caisses', values: ['1', '2', 'Illimité'] },
    { label: 'Produits', values: ['50', 'Illimité', 'Illimité'] },
    { label: 'Gestion du stock', values: [true, true, true] },
    { label: 'Tickets de caisse', values: [true, true, true] },
    { label: 'Multi-devises', values: [false, true, true] },
    { label: 'Gestion des clients', values: [false, true, true] },
    { label: 'Statistiques & rapports', values: [false, true, true] },
    { label: 'Site de réservation en ligne', values: [false, true, true] },
    { label: 'Gestion des entreprises', values: [false, false, true] },
    { label: 'Quote part employeur', values: [false, false, true] },
    { label: 'Personnalisation avancée', values: [false, false, true] },
    { label: 'Support', values: ['Email (48h)', 'Prioritaire (24h)', 'Dédié + SLA'] },
];

// ─── Prorated billing ───

export type SubscriptionEventType = 'start' | 'stop' | 'plan_change';

export interface SubscriptionEvent {
    event_type: SubscriptionEventType;
    plan: SubscriptionPlan | null; // plan after the event (null on 'stop')
    created_at: string | Date;
}

export interface DayBilling {
    date: string; // YYYY-MM-DD
    plan: SubscriptionPlan | null; // highest plan active that day
    price: number; // plan.monthlyPrice / daysInMonth (0 when stopped)
}

export interface MonthlyBill {
    year: number;
    month: number; // 1-12
    total: number;
    days: DayBilling[];
}

function toDate(value: string | Date): Date {
    return value instanceof Date ? value : new Date(value);
}

/**
 * Compute the prorated invoice for a month from the event log.
 * Each day is billed at the most expensive plan active at any point during
 * that day ("on est facturé le tarif le plus cher pour la journée").
 *
 * The total never exceeds the monthly price of the most expensive plan used
 * (otherwise 31-day months would over-bill: 31 × price/30 > price).
 * For the current month, only days up to today are billed.
 */
export function computeMonthlyBill(
    events: SubscriptionEvent[],
    year: number,
    month: number,
    today: Date = new Date()
): MonthlyBill {
    const daysInMonth = new Date(year, month, 0).getDate();
    const DAYS_DIVISOR = 30; // fixed 30-day month, per billing spec
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
    const lastDay = isCurrentMonth ? Math.min(today.getDate(), daysInMonth) : daysInMonth;

    const sorted = [...events]
        .map((e) => ({ ...e, at: toDate(e.created_at) }))
        .filter((e) => !isNaN(e.at.getTime())) // a malformed date must not corrupt the whole month
        .sort((a, b) => a.at.getTime() - b.at.getTime());

    const days: DayBilling[] = [];
    let total = 0;

    let maxPlanPrice = 0;
    for (let day = 1; day <= lastDay; day++) {
        const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
        const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999);

        // Plans active at any point during this day: the state at day start,
        // plus every event inside the day.
        let current: SubscriptionPlan | null = null;
        for (const e of sorted) {
            if (e.at <= dayStart) current = isSubscriptionPlan(e.plan) ? e.plan : null;
            else break;
        }
        let best: SubscriptionPlan | null = current;
        for (const e of sorted) {
            if (e.at <= dayStart) continue;
            if (e.at > dayEnd) break;
            current = isSubscriptionPlan(e.plan) ? e.plan : null;
            if (current && (!best || planRank(current) > planRank(best))) best = current;
        }

        // Keep the exact daily amount — rounding each day would drift the
        // monthly total (e.g. 50/30 × 30 = 50.10). Round only the invoice.
        const price = best ? SUBSCRIPTION_PLANS[best].monthlyPrice / DAYS_DIVISOR : 0;
        if (best) maxPlanPrice = Math.max(maxPlanPrice, SUBSCRIPTION_PLANS[best].monthlyPrice);
        total += price;
        days.push({ date: formatDay(dayStart), plan: best, price: round2(price) });
    }

    // Never bill more than the most expensive plan's full monthly price.
    return { year, month, total: round2(Math.min(total, maxPlanPrice || total)), days };
}

function planRank(plan: SubscriptionPlan): number {
    return PLAN_ORDER.indexOf(plan);
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function formatDay(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
