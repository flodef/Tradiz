import { NextResponse } from 'next/server';
import { cached } from './apiCache';
import { getPosDb, type DbConnection } from './db';
import {
    SUBSCRIPTION_PLANS,
    isSubscriptionPlan,
    type PlanLimits,
    type SubscriptionEvent,
    type SubscriptionPlan,
} from '@/app/utils/subscription';

export interface SubscriptionRow {
    plan: SubscriptionPlan;
    status: 'active' | 'stopped';
    billing_method: 'card' | 'transfer';
}

// Shops that predate the subscription tables (or have no row yet) keep full
// access — the Privilège plan is the grandfathered default.
const DEFAULT_ROW: SubscriptionRow = { plan: 'privilege', status: 'active', billing_method: 'transfer' };

export function subscriptionPrefix(conn: DbConnection): string {
    return conn.isPostgreSQL ? 'dc_pos.' : '';
}

// Only a genuinely missing table/row should fall back to the grandfathered
// default — any other DB error (timeout, permissions…) must fail closed:
// returning 'privilege/active' would silently unlock a stopped shop.
function isMissingTableError(error: unknown): boolean {
    const code = (error as { code?: string })?.code;
    // pg: 42P01 undefined_table — MySQL/MariaDB: ER_NO_SUCH_TABLE
    return code === '42P01' || code === 'ER_NO_SUCH_TABLE';
}

export async function readSubscription(connection: DbConnection): Promise<SubscriptionRow> {
    // Cached per shop (~30 s): this pair of queries runs on nearly every
    // write route, so each call otherwise costs two remote-DB round trips.
    // The subscription route invalidates 'sub:' on every mutation.
    return cached(`sub:${connection.shopId ?? ''}`, () => readSubscriptionFromDb(connection));
}

export async function readSubscriptionFromDb(connection: DbConnection): Promise<SubscriptionRow> {
    try {
        const [rows] = await connection.execute(
            `SELECT plan, status, billing_method FROM ${subscriptionPrefix(connection)}subscription WHERE id = 1`
        );
        const row = (rows as { plan: string; status: string; billing_method: string }[])[0];
        if (!row || !isSubscriptionPlan(row.plan)) return DEFAULT_ROW;
        // An empty event log means no subscription was ever started — treat
        // the shop as stopped (read-only), not as grandfathered.
        const [eventRows] = await connection.execute(
            `SELECT 1 AS x FROM ${subscriptionPrefix(connection)}subscription_events LIMIT 1`
        );
        const hasSubscription = (eventRows as unknown[]).length > 0;
        return {
            plan: row.plan,
            status: hasSubscription && row.status !== 'stopped' ? 'active' : 'stopped',
            billing_method: row.billing_method === 'card' ? 'card' : 'transfer',
        };
    } catch (error) {
        if (isMissingTableError(error)) return DEFAULT_ROW; // table not migrated yet
        console.error('readSubscription failed — failing closed path:', error);
        throw error;
    }
}

export async function readSubscriptionEvents(connection: DbConnection): Promise<SubscriptionEvent[]> {
    try {
        const [rows] = await connection.execute(
            `SELECT event_type, plan, created_at FROM ${subscriptionPrefix(connection)}subscription_events ORDER BY id ASC`
        );
        return rows as SubscriptionEvent[];
    } catch (error) {
        if (isMissingTableError(error)) return [];
        console.error('readSubscriptionEvents failed:', error);
        throw error;
    }
}

export function stoppedSubscriptionResponse(): NextResponse {
    return NextResponse.json({ error: 'Abonnement suspendu — application en lecture seule.' }, { status: 403 });
}

/** For routes holding a POS connection already. */
export async function subscriptionStopped(connection: DbConnection): Promise<boolean> {
    return (await readSubscription(connection)).status === 'stopped';
}

/**
 * For routes that do NOT hold a POS connection (e.g. catalog routes on the
 * main DB): opens one, checks the subscription, returns a 403 response when
 * the shop is in read-only mode — or null when writes are allowed.
 */
export async function assertSubscriptionActive(shopId: string): Promise<NextResponse | null> {
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);
        if (await subscriptionStopped(connection)) return stoppedSubscriptionResponse();
        return null;
    } finally {
        await connection?.end();
    }
}

/**
 * Same as assertSubscriptionActive, plus a plan-limit check: returns a 403
 * when the subscription is stopped OR the current plan lacks `feature`.
 */
export async function assertPlanFeature(
    shopId: string,
    feature: keyof PlanLimits,
    errorMessage: string
): Promise<NextResponse | null> {
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);
        const sub = await readSubscription(connection);
        if (sub.status === 'stopped') return stoppedSubscriptionResponse();
        const allowed = SUBSCRIPTION_PLANS[sub.plan].limits[feature];
        if (allowed === false || allowed === 0) {
            return NextResponse.json({ error: errorMessage }, { status: 403 });
        }
        return null;
    } finally {
        await connection?.end();
    }
}
