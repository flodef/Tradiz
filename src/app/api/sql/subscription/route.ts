import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { insertAuditEvent, lockHashChain } from '../auditHelpers';
import {
    computeMonthlyBill,
    isSubscriptionPlan,
    SUBSCRIPTION_PLANS,
    type BillingMethod,
    type SubscriptionPlan,
    type SubscriptionStatus,
} from '@/app/utils/subscription';
import { readSubscription, readSubscriptionEvents, subscriptionPrefix } from '../subscriptionStore';

export const dynamic = 'force-dynamic';

function prefix(conn: DbConnection): string {
    return subscriptionPrefix(conn);
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);
        const row = await readSubscription(connection);
        const events = await readSubscriptionEvents(connection);
        const now = new Date();
        const bill = computeMonthlyBill(events, now.getFullYear(), now.getMonth() + 1);
        return NextResponse.json({
            plan: row.plan,
            status: row.status,
            billing_method: row.billing_method,
            limits: SUBSCRIPTION_PLANS[row.plan as SubscriptionPlan].limits,
            month_to_date: bill.total,
            bill,
        });
    } catch (error) {
        console.error('Error reading subscription:', error);
        return NextResponse.json({ error: 'An error occurred while reading subscription' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const body = (await request.json()) as {
            action?: 'start' | 'stop' | 'plan_change' | 'billing_method';
            plan?: SubscriptionPlan;
            billing_method?: BillingMethod;
        };
        if (!body.action) {
            return NextResponse.json({ error: 'action is required' }, { status: 400 });
        }

        connection = await getPosDb(shopId);
        const p = prefix(connection);
        const isPg = connection.isPostgreSQL;

        await connection.beginTransaction();
        // Serialize with other audit/chain writers — the subscription change is
        // audit-logged, and two concurrent admins must not double-toggle.
        const unlock = await lockHashChain(connection, 'nf525_audit_events');
        try {
            // Ensure the singleton row exists (fresh DBs, partial migrations).
            await connection.execute(
                isPg
                    ? `INSERT INTO ${p}subscription (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
                    : `INSERT IGNORE INTO ${p}subscription (id) VALUES (1)`
            );
            const current = await readSubscription(connection);
            const status = current.status as SubscriptionStatus;

            // Anti-ping-pong: at most 3 subscription changes per day
            // (billing_method switches don't count — they write no event).
            const countQuery = isPg
                ? `SELECT COUNT(*) AS c FROM ${p}subscription_events WHERE created_at >= CURRENT_DATE`
                : `SELECT COUNT(*) AS c FROM ${p}subscription_events WHERE created_at >= CURDATE()`;
            const [countRows] = await connection.execute(countQuery);
            const changesToday = Number((countRows as { c: number | string }[])[0]?.c) || 0;

            const fail = async (msg: string, code = 400) => {
                await connection!.rollback();
                return NextResponse.json({ error: msg }, { status: code });
            };

            if (
                (body.action === 'start' || body.action === 'stop' || body.action === 'plan_change') &&
                changesToday >= 3
            ) {
                return fail(
                    'Nombre maximum de changements d\u2019abonnement atteint pour aujourd\u2019hui (3 par jour).',
                    429
                );
            }

            if (body.action === 'billing_method') {
                if (body.billing_method !== 'revolut' && body.billing_method !== 'invoice') {
                    return fail('billing_method must be "revolut" or "invoice"');
                }
                await connection.execute(
                    isPg
                        ? `UPDATE ${p}subscription SET billing_method = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1`
                        : `UPDATE ${p}subscription SET billing_method = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
                    [body.billing_method]
                );
            } else if (body.action === 'stop') {
                if (status !== 'active') return fail('Subscription is already stopped', 409);
                await writeEvent(connection, 'stop', null);
                await connection.execute(
                    isPg
                        ? `UPDATE ${p}subscription SET status = 'stopped', updated_at = CURRENT_TIMESTAMP WHERE id = 1`
                        : `UPDATE ${p}subscription SET status = 'stopped', updated_at = CURRENT_TIMESTAMP WHERE id = 1`
                );
            } else if (body.action === 'start') {
                if (status === 'active') return fail('Subscription is already active', 409);
                const plan = body.plan ?? (current.plan as SubscriptionPlan);
                if (!isSubscriptionPlan(plan)) return fail('Invalid plan');
                await writeEvent(connection, 'start', plan);
                await connection.execute(
                    isPg
                        ? `UPDATE ${p}subscription SET status = 'active', plan = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1`
                        : `UPDATE ${p}subscription SET status = 'active', plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
                    [plan]
                );
            } else if (body.action === 'plan_change') {
                if (status !== 'active') return fail('Restart the subscription before changing plan', 409);
                if (!isSubscriptionPlan(body.plan)) return fail('Invalid plan');
                if (body.plan === current.plan) return fail('Already on this plan', 409);
                await writeEvent(connection, 'plan_change', body.plan);
                await connection.execute(
                    isPg
                        ? `UPDATE ${p}subscription SET plan = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1`
                        : `UPDATE ${p}subscription SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
                    [body.plan]
                );
            } else {
                return fail('Unknown action');
            }

            await insertAuditEvent(connection, {
                event_type: 'subscription_change',
                entity_type: 'subscription',
                entity_id: 'subscription',
                user_name: 'admin',
                detail: JSON.stringify({ action: body.action, plan: body.plan ?? null }),
            });

            await connection.commit();
            return NextResponse.json({ success: true });
        } finally {
            await unlock();
        }
    } catch (error) {
        console.error('Error updating subscription:', error);
        try {
            await connection?.rollback();
        } catch {
            // no open transaction — nothing to roll back
        }
        return NextResponse.json({ error: 'An error occurred while updating subscription' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}

async function writeEvent(connection: DbConnection, eventType: string, plan: string | null) {
    const p = prefix(connection);
    await connection.execute(
        connection.isPostgreSQL
            ? `INSERT INTO ${p}subscription_events (event_type, plan) VALUES ($1, $2)`
            : `INSERT INTO ${p}subscription_events (event_type, plan) VALUES (?, ?)`,
        [eventType, plan]
    );
}
