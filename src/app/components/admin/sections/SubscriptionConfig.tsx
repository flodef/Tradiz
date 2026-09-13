'use client';

import { usePopup } from '@/app/hooks/usePopup';
import { useSubscription } from '@/app/hooks/useSubscription';
import { FEATURE_MATRIX, PLAN_ORDER, SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@/app/utils/subscription';
import { IconCheck, IconX } from '@tabler/icons-react';
import { adminTextStyle } from '@/app/utils/constants';

/** Comparative table: features × the 3 plans. */
function PlanComparisonTable({ highlight }: { highlight?: SubscriptionPlan }) {
    return (
        <div className="w-full overflow-x-auto py-2 px-1">
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr className="border-b border-gray-300 dark:border-gray-600">
                        <th className="text-left py-2 pr-4 font-semibold">Fonctionnalité</th>
                        {PLAN_ORDER.map((id) => (
                            <th
                                key={id}
                                className={`text-center py-2 px-3 font-semibold ${id === highlight ? 'text-orange-500' : ''}`}
                            >
                                {SUBSCRIPTION_PLANS[id].name}
                                <div className="text-xs font-normal text-muted">
                                    {SUBSCRIPTION_PLANS[id].monthlyPrice} €/mois
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {FEATURE_MATRIX.map((row) => (
                        <tr key={row.label} className="border-b border-gray-200 dark:border-gray-700">
                            <td className="py-1.5 pr-4 text-left">{row.label}</td>
                            {row.values.map((v, i) => (
                                <td
                                    key={i}
                                    className={`text-center py-1.5 px-3 ${PLAN_ORDER[i] === highlight ? 'bg-orange-500/5' : ''}`}
                                >
                                    {typeof v === 'string' ? (
                                        <span className="text-xs">{v}</span>
                                    ) : v ? (
                                        <IconCheck size={16} className="inline text-green-500" />
                                    ) : (
                                        <IconX size={16} className="inline text-red-400" />
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="text-xs text-muted mt-3 text-left">
                Facturation au prorata du mois : chaque jour est facturé au tarif de la formule la plus élevée utilisée
                ce jour-là. Sans engagement — arrêt possible à tout moment.
            </p>
        </div>
    );
}

export default function SubscriptionConfig({ isReadOnly }: { isReadOnly: boolean }) {
    const { openPopup, openFullscreenPopup, closePopup } = usePopup();
    const { plan, status, billingMethod, monthToDate, loaded, act } = useSubscription();
    const isActive = status === 'active';
    const currentPlan = SUBSCRIPTION_PLANS[plan];

    const run = (body: Record<string, unknown>, successMsg: string) => {
        act(body)
            .then(() => openPopup('Abonnement', [successMsg]))
            .catch((e) => openPopup('Erreur', [e instanceof Error ? e.message : 'Erreur inconnue']));
    };

    const confirm = (question: string, onConfirm: () => void) => {
        openPopup(question, ['Annuler', 'Confirmer'], (index) => {
            if (index === 1) closePopup(onConfirm);
        });
    };

    const openPlanPicker = (title: string, action: 'plan_change' | 'start') => {
        const options = PLAN_ORDER.map(
            (id) => `${SUBSCRIPTION_PLANS[id].name} — ${SUBSCRIPTION_PLANS[id].monthlyPrice} €/mois`
        );
        openFullscreenPopup(
            title,
            [<PlanComparisonTable key="plans" highlight={action === 'plan_change' ? plan : undefined} />, ...options],
            (index) => {
                if (index < 1 || index > PLAN_ORDER.length) return; // 0 = table
                const chosen = PLAN_ORDER[index - 1];
                closePopup(() => {
                    confirm(
                        `Passer à la formule ${SUBSCRIPTION_PLANS[chosen].name} (${SUBSCRIPTION_PLANS[chosen].monthlyPrice} €/mois) ? Le changement est immédiat et la journée est facturée au tarif le plus élevé utilisé.`,
                        () => run({ action, plan: chosen }, `Formule ${SUBSCRIPTION_PLANS[chosen].name} activée`)
                    );
                });
            },
            true
        );
    };

    const stopSubscription = () =>
        confirm(
            "Suspendre l'abonnement ? L'application passe en lecture seule immédiatement (seuls le Z, la calculatrice et la recherche restent accessibles). Les jours déjà passés restent facturés au prorata.",
            () => run({ action: 'stop' }, 'Abonnement suspendu — application en lecture seule')
        );

    const setBilling = (method: 'revolut' | 'invoice') => {
        if (method === billingMethod) return;
        confirm(
            method === 'revolut'
                ? 'Payer par Revolut : le montant du mois sera prélevé automatiquement en fin de mois. Confirmer ?'
                : 'Payer par facture : vous recevrez une facture en fin de mois. Confirmer ?',
            () =>
                run(
                    { action: 'billing_method', billing_method: method },
                    method === 'revolut' ? 'Paiement Revolut activé' : 'Paiement par facture activé'
                )
        );
    };

    if (!loaded) return null;

    return (
        <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                Abonnement
            </h3>
            <div className="flex flex-wrap gap-6 items-end">
                <div className="flex flex-col gap-1">
                    <label className={adminTextStyle}>Formule actuelle</label>
                    <div className="flex items-center gap-3">
                        <span className="text-lg font-bold">
                            {currentPlan.name} — {currentPlan.monthlyPrice} €/mois
                        </span>
                        <span
                            className={`text-xs px-2 py-1 rounded-full font-semibold ${
                                isActive ? 'bg-green-500/15 text-green-600' : 'bg-red-500/15 text-red-500'
                            }`}
                        >
                            {isActive ? 'Actif' : 'Suspendu'}
                        </span>
                    </div>
                    <span className="text-xs text-muted">
                        Estimation du mois en cours : {monthToDate.toFixed(2)} € (prorata journalier)
                    </span>
                </div>

                <div className="flex flex-col gap-1">
                    <label className={adminTextStyle}>Paiement</label>
                    <div className="flex rounded-xl overflow-hidden border border-gray-300 dark:border-gray-600">
                        {(
                            [
                                ['invoice', 'Facture'],
                                ['revolut', 'Revolut'],
                            ] as const
                        ).map(([method, label]) => (
                            <button
                                key={method}
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => setBilling(method)}
                                className={`px-4 py-2 text-sm font-semibold transition cursor-pointer disabled:cursor-default ${
                                    billingMethod === method
                                        ? 'bg-orange-500 text-white'
                                        : 'hover:bg-black/5 dark:hover:bg-white/10'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => (isActive ? openPlanPicker('Changer de formule', 'plan_change') : undefined)}
                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-secondary-active-light dark:bg-secondary-active-dark text-popup-dark dark:text-popup-light cursor-pointer disabled:opacity-50 disabled:cursor-default"
                    >
                        {isActive ? 'Changer de formule' : 'Changer de formule'}
                    </button>
                    {isActive ? (
                        <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={stopSubscription}
                            className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500/15 text-red-500 hover:bg-red-500/25 cursor-pointer disabled:opacity-50 disabled:cursor-default"
                        >
                            Suspendre
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => openPlanPicker("Reprendre l'abonnement", 'start')}
                            className="px-4 py-2 rounded-xl text-sm font-semibold bg-green-500/15 text-green-600 hover:bg-green-500/25 cursor-pointer disabled:opacity-50 disabled:cursor-default"
                        >
                            Reprendre
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() =>
                            openFullscreenPopup(
                                'Comparatif des formules',
                                [<PlanComparisonTable key="plans" highlight={plan} />],
                                () => {},
                                true
                            )
                        }
                        className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                        title="Voir le comparatif des fonctionnalités"
                    >
                        Comparatif
                    </button>
                </div>
            </div>
        </div>
    );
}
