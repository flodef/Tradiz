'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { IconCircleCheck, IconLoader2, IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { useTheme } from '../site/theme';

const PLANS: Record<string, { name: string; monthly: number }> = {
    decouverte: { name: 'Découverte', monthly: 30 },
    pro: { name: 'Pro', monthly: 50 },
    privilege: { name: 'Privilège', monthly: 100 },
};

function CheckoutContent() {
    const searchParams = useSearchParams();
    const plan = searchParams.get('plan') as keyof typeof PLANS | null;
    const status = searchParams.get('status');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [orderToken, setOrderToken] = useState<string | null>(null);
    const [revolutMode, setRevolutMode] = useState<'prod' | 'sandbox'>('sandbox');
    const widgetRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<{ destroy: () => void } | null>(null);

    const planData = plan && PLANS[plan] ? PLANS[plan] : null;
    const amount = planData ? planData.monthly : 0;

    useEffect(() => {
        fetch('/api/revolut-config')
            .then((r) => r.json())
            .then((d) => setRevolutMode(d.mode === 'prod' ? 'prod' : 'sandbox'))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (status === 'success') return;
        if (!planData || !amount) return;
        if (orderToken) return;

        const controller = new AbortController();

        const createOrder = async () => {
            setLoading(true);
            setError(null);

            try {
                const res = await fetch('/api/create-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        planName: planData.name,
                        billing: 'monthly',
                        currency: 'EUR',
                    }),
                    signal: controller.signal,
                });

                if (!res.ok) {
                    const data = await res.json().catch(() => ({ error: 'Failed to create order' }));
                    if (data.error?.includes('not configured')) {
                        window.location.href = '/landing#contact';
                        return;
                    }
                    throw new Error(data.error || 'Failed to create order');
                }

                const { token } = await res.json();
                setOrderToken(token);
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                console.error('Checkout error:', err);
                setError(err instanceof Error ? err.message : 'Une erreur est survenue');
            } finally {
                setLoading(false);
            }
        };

        createOrder();

        return () => controller.abort();
    }, [plan, planData, amount, orderToken, status]);

    useEffect(() => {
        if (!orderToken || !widgetRef.current) return;

        let destroyed = false;

        const mountWidget = async () => {
            try {
                const RevolutCheckout = (await import('@revolut/checkout')).default;
                if (destroyed) return;

                const instance = await RevolutCheckout(orderToken, revolutMode);

                if (destroyed) {
                    instance.destroy();
                    return;
                }

                instanceRef.current = instance;

                instance.payWithPopup({
                    onSuccess: () => {
                        window.location.href = '/checkout?status=success';
                    },
                    onError: (err: unknown) => {
                        console.error('Payment error:', err);
                        setError('Le paiement a échoué. Veuillez réessayer.');
                    },
                    onCancel: () => {
                        setError('Paiement annulé.');
                    },
                });
            } catch (err) {
                console.error('Widget mount error:', err);
                setError('Impossible de charger le widget de paiement.');
            }
        };

        mountWidget();

        return () => {
            destroyed = true;
            instanceRef.current?.destroy();
            instanceRef.current = null;
        };
    }, [orderToken, revolutMode]);

    if (status === 'success') {
        return (
            <div className="min-h-screen flex items-center justify-center px-6 bg-site-bg text-site-text">
                <div className="max-w-md text-center p-8 rounded-3xl bg-site-surface border border-site-border">
                    <IconCircleCheck size={64} className="text-green-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold mb-2">Paiement réussi !</h1>
                    <p className="text-site-text-secondary mb-6">
                        Merci pour votre abonnement. Nous vous contacterons sous 24h pour finaliser la mise en place.
                    </p>
                    <a
                        href="/landing"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-linear-to-r from-orange-500 to-amber-600 text-white font-semibold hover:opacity-90 transition-opacity"
                    >
                        <IconArrowLeft size={20} />
                        Retour à l'accueil
                    </a>
                </div>
            </div>
        );
    }

    if (!planData) {
        return (
            <div className="min-h-screen flex items-center justify-center px-6 bg-site-bg text-site-text">
                <div className="max-w-md text-center p-8 rounded-3xl bg-site-surface border border-site-border">
                    <IconAlertCircle size={48} className="text-amber-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold mb-2">Plan non spécifié</h1>
                    <p className="text-site-text-secondary mb-6">Veuillez choisir un plan depuis la page des tarifs.</p>
                    <a
                        href="/landing#tarifs"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-linear-to-r from-orange-500 to-amber-600 text-white font-semibold hover:opacity-90 transition-opacity"
                    >
                        <IconArrowLeft size={20} />
                        Voir les tarifs
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-site-bg text-site-text">
            <div className="w-full max-w-md">
                <a
                    href="/landing#tarifs"
                    className="inline-flex items-center gap-2 text-sm text-site-text-secondary hover:text-site-text transition-colors mb-6"
                >
                    <IconArrowLeft size={16} />
                    Retour aux tarifs
                </a>

                <div className="p-8 rounded-3xl bg-site-surface border border-site-border">
                    <div className="flex items-center gap-2 mb-6">
                        <span className="text-xl font-bold bg-linear-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent">
                            Tradiz
                        </span>
                    </div>

                    <h1 className="text-2xl font-bold mb-1">Paiement de l'abonnement</h1>
                    <p className="text-site-text-secondary text-sm mb-6">
                        Forfait {planData.name} — mensuel, sans engagement
                    </p>

                    <div className="rounded-xl p-4 mb-6 bg-site-input-bg border border-site-input-border">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-site-text-secondary">Forfait</span>
                            <span className="text-sm font-semibold">{planData.name}</span>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-site-text-secondary">Facturation</span>
                            <span className="text-sm font-semibold">Mensuelle (prorata journalier)</span>
                        </div>
                        <div className="border-t border-site-border pt-2 mt-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-site-text-secondary">Total</span>
                                <span className="text-2xl font-extrabold bg-linear-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent">
                                    {amount}€
                                </span>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
                            {error}
                        </div>
                    )}

                    {loading && (
                        <div className="flex items-center justify-center py-8">
                            <IconLoader2 size={32} className="animate-spin text-orange-500" />
                            <span className="ml-3 text-sm text-site-text-secondary">Préparation du paiement...</span>
                        </div>
                    )}

                    <div ref={widgetRef} />

                    {!loading && !orderToken && !error && (
                        <div className="flex items-center justify-center py-8">
                            <IconLoader2 size={32} className="animate-spin text-orange-500" />
                            <span className="ml-3 text-sm text-site-text-secondary">Chargement...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function CheckoutPage() {
    useTheme();
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center bg-site-bg">
                    <IconLoader2 size={32} className="animate-spin text-orange-500" />
                </div>
            }
        >
            <CheckoutContent />
        </Suspense>
    );
}
