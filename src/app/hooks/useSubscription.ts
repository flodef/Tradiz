'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    isSubscriptionPlan,
    SUBSCRIPTION_PLANS,
    type BillingMethod,
    type PlanLimits,
    type SubscriptionPlan,
    type SubscriptionStatus,
} from '../utils/subscription';

export interface SubscriptionState {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    billingMethod: BillingMethod;
    limits: PlanLimits;
    monthToDate: number;
    /** False until the first fetch resolves — callers must not gate on defaults. */
    loaded: boolean;
}

const DEFAULTS: SubscriptionState = {
    plan: 'privilege',
    status: 'active',
    billingMethod: 'invoice',
    limits: SUBSCRIPTION_PLANS.privilege.limits,
    monthToDate: 0,
    loaded: false,
};

const POLL_MS = 60_000;
// Broadcast channel so all consumers (DataProvider lock, admin UI, TopNav)
// refresh immediately when any of them changes the subscription — otherwise
// a stop would take up to POLL_MS to reach the POS read-only lock.
const SUBSCRIPTION_CHANGED_EVENT = 'subscription-changed';

/**
 * Current subscription state for this shop, polled from /api/sql/subscription.
 * A stopped subscription is what drives the POS read-only mode (same blocking
 * as a daily closure).
 */
export function useSubscription() {
    const [state, setState] = useState<SubscriptionState>(DEFAULTS);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/sql/subscription');
            if (!res.ok) return;
            const data = (await res.json()) as Record<string, unknown>;
            const plan: SubscriptionPlan = isSubscriptionPlan(data.plan) ? data.plan : 'privilege';
            setState({
                plan,
                status: data.status === 'stopped' ? 'stopped' : 'active',
                billingMethod: data.billing_method === 'revolut' ? 'revolut' : 'invoice',
                limits: SUBSCRIPTION_PLANS[plan].limits,
                monthToDate: typeof data.month_to_date === 'number' ? data.month_to_date : 0,
                loaded: true,
            });
        } catch {
            // Network/DB down — keep last known state (defaults = full access)
        }
    }, []);

    useEffect(() => {
        void refresh();
        const interval = setInterval(refresh, POLL_MS);
        const onFocus = () => void refresh();
        const onChanged = () => void refresh();
        window.addEventListener('focus', onFocus);
        window.addEventListener(SUBSCRIPTION_CHANGED_EVENT, onChanged);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener(SUBSCRIPTION_CHANGED_EVENT, onChanged);
        };
    }, [refresh]);

    const act = useCallback(
        async (body: Record<string, unknown>) => {
            const res = await fetch('/api/sql/subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erreur abonnement');
            await refresh();
            // Propagate instantly to the other hook instances (POS lock…).
            window.dispatchEvent(new Event(SUBSCRIPTION_CHANGED_EVENT));
            return data;
        },
        [refresh]
    );

    return { ...state, isActive: state.status === 'active', refresh, act };
}
