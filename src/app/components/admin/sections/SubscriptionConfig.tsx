'use client';

import { usePopup } from '@/app/hooks/usePopup';
import { useIsMobile } from '@/app/utils/mobile';
import { useSubscription } from '@/app/hooks/useSubscription';
import { FEATURE_MATRIX, PLAN_ORDER, SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@/app/utils/subscription';
import { IconCheck, IconX } from '@tabler/icons-react';
import AdminButton from '../AdminButton';
import AdminSegmentedControl from '../AdminSegmentedControl';

/** Comparative table: features × the 3 plans. Fixed layout so it always fits
 * the popup width — no horizontal scroll. */
function PlanComparisonTable({ highlight }: { highlight?: SubscriptionPlan }) {
    return (
        <div className="w-full py-2 px-1">
            <table className="w-full table-fixed text-sm border-collapse">
                <thead>
                    <tr className="border-b border-gray-300 dark:border-gray-600">
                        <th className="text-left py-2 pr-2 font-semibold"></th>
                        {PLAN_ORDER.map((id) => (
                            <th key={id} className="w-20 text-center py-1 px-0.5 font-semibold">
                                <span
                                    className={`block rounded-lg py-1 ${
                                        id === highlight
                                            ? 'bg-secondary-active-light dark:bg-secondary-active-dark text-popup-dark dark:text-popup-light'
                                            : ''
                                    }`}
                                >
                                    <span className="block text-xs font-bold leading-tight tracking-tight wrap-break-word">
                                        {SUBSCRIPTION_PLANS[id].name}
                                    </span>
                                    <div className={`text-xs font-normal ${id === highlight ? '' : 'text-muted'}`}>
                                        {SUBSCRIPTION_PLANS[id].monthlyPrice} €/mois
                                    </div>
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {FEATURE_MATRIX.map((row) => (
                        <tr key={row.label} className="border-b border-gray-200 dark:border-gray-700">
                            <td className="py-1.5 pr-2 text-left">{row.label}</td>
                            {row.values.map((v, i) => (
                                <td
                                    key={i}
                                    className={`text-center py-1.5 px-1 ${
                                        PLAN_ORDER[i] === highlight
                                            ? 'bg-secondary-active-light/15 dark:bg-secondary-active-dark/15'
                                            : ''
                                    }`}
                                >
                                    {typeof v === 'string' ? (
                                        <span className="text-xs">{v}</span>
                                    ) : v ? (
                                        <IconCheck size={22} stroke={3} className="inline text-ok" />
                                    ) : (
                                        <IconX size={22} stroke={3} className="inline text-error" />
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
    const { openFullscreenPopup, closePopup } = usePopup();
    const isMobile = useIsMobile();
    const { plan, status, billingMethod, monthToDate, loaded, act } = useSubscription();
    const isActive = status === 'active';
    const currentPlan = SUBSCRIPTION_PLANS[plan];

    const run = (body: Record<string, unknown>, successMsg: string) => {
        act(body)
            .then(() => openFullscreenPopup('Abonnement', [successMsg]))
            .catch((e) => openFullscreenPopup('Erreur', [e instanceof Error ? e.message : 'Erreur inconnue']));
    };

    const confirm = (question: string, onConfirm: () => void) => {
        openFullscreenPopup(question, ['Annuler', 'Confirmer'], (index) => {
            if (index === 1) closePopup(onConfirm);
        });
    };

    const confirmPlan = (action: 'plan_change' | 'start', chosen: SubscriptionPlan) => {
        closePopup(() => {
            confirm(
                `Passer à la formule ${SUBSCRIPTION_PLANS[chosen].name} (${SUBSCRIPTION_PLANS[chosen].monthlyPrice} €/mois) ? Le changement est immédiat et la journée est facturée au tarif le plus élevé utilisé.`,
                () => run({ action, plan: chosen }, `Formule ${SUBSCRIPTION_PLANS[chosen].name} activée`)
            );
        });
    };

    const openPlanPicker = (title: string, action: 'plan_change' | 'start') => {
        // For a plan_change the current plan would 409 anyway — don't offer it.
        const choices = action === 'plan_change' ? PLAN_ORDER.filter((id) => id !== plan) : PLAN_ORDER;
        const options = choices.map(
            (id) => `${SUBSCRIPTION_PLANS[id].name} — ${SUBSCRIPTION_PLANS[id].monthlyPrice} €/mois`
        );
        if (action === 'plan_change') {
            // Just the other plans — the full table stays behind "Comparatif".
            openFullscreenPopup(
                title,
                options,
                (index) => {
                    if (index < 0 || index >= choices.length) return;
                    confirmPlan(action, choices[index]);
                },
                true
            );
            return;
        }
        // Reprendre: the comparison table helps pick the plan to restart on.
        openFullscreenPopup(
            title,
            [<PlanComparisonTable key="plans" />, ...options],
            (index) => {
                if (index < 1 || index > choices.length) return; // 0 = table
                confirmPlan(action, choices[index - 1]);
            },
            true
        );
    };

    const stopSubscription = () =>
        confirm(
            "Suspendre l'abonnement ? L'application passe en lecture seule immédiatement (seuls le Z, la calculatrice et la recherche restent accessibles). Les jours déjà passés restent facturés au prorata.",
            () => run({ action: 'stop' }, 'Abonnement suspendu — application en lecture seule')
        );

    const setBilling = (method: 'card' | 'transfer') => {
        if (method === billingMethod) return;
        confirm(
            method === 'card'
                ? 'Payer par carte bancaire : le montant du mois sera prélevé automatiquement en fin de mois. Confirmer ?'
                : 'Payer par virement : vous recevrez une facture à régler en fin de mois. Confirmer ?',
            () =>
                run(
                    { action: 'billing_method', billing_method: method },
                    method === 'card' ? 'Paiement par carte bancaire activé' : 'Paiement par virement activé'
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
                    <label className="text-left text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                        Formule actuelle
                    </label>
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

                <AdminSegmentedControl
                    label="Paiement"
                    isReadOnly={isReadOnly}
                    value={billingMethod}
                    onChange={(v) => setBilling(v as 'card' | 'transfer')}
                    options={[
                        { label: 'Virement', value: 'transfer' },
                        { label: 'Carte bancaire', value: 'card' },
                    ]}
                />

                <div className="flex gap-3">
                    {isActive && (
                        <AdminButton
                            variant="primary"
                            disabled={isReadOnly}
                            onClick={() => openPlanPicker('Changer de formule', 'plan_change')}
                        >
                            {isMobile ? 'Changer' : 'Changer de formule'}
                        </AdminButton>
                    )}
                    {isActive ? (
                        <AdminButton variant="danger" disabled={isReadOnly} onClick={stopSubscription}>
                            Suspendre
                        </AdminButton>
                    ) : (
                        <AdminButton
                            variant="add"
                            disabled={isReadOnly}
                            onClick={() => openPlanPicker("Reprendre l'abonnement", 'start')}
                        >
                            Reprendre
                        </AdminButton>
                    )}
                    <AdminButton
                        variant="primary"
                        onClick={() =>
                            openFullscreenPopup(
                                'Comparatif des formules',
                                [<PlanComparisonTable key="plans" highlight={plan} />],
                                () => {},
                                true
                            )
                        }
                        title="Voir le comparatif des fonctionnalités"
                    >
                        Comparatif
                    </AdminButton>
                </div>
            </div>
        </div>
    );
}
