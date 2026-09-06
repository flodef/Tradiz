'use client';

import { FC, useCallback, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { IconBackspace, IconCheck, IconList, IconPlus, IconTrash, IconUsers, IconX } from '@tabler/icons-react';
import { useConfig } from '../hooks/useConfig';
import { usePopup } from '../hooks/usePopup';
import { useIsMobileDevice } from '../utils/mobile';
import { CASH_KEYWORD } from '../utils/constants';
import { getPaymentIcon } from '../utils/paymentIcons';
import { PaymentLeg, Product } from '../utils/interfaces';
import { Amount } from './Amount';

export type SplitMode = 'even' | 'round-robin' | 'item-pick';

interface SplitPaymentPopupProps {
    total: number;
    products: Product[];
    paymentMethods: string[];
    mode: SplitMode;
    onCancel: () => void;
    onConfirm: (legs: PaymentLeg[]) => void;
}

type NumpadKey =
    '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0' | '00' | '.' | 'backspace' | 'clear' | 'exact';

const KeypadButton: FC<{ label: React.ReactNode; onClick: () => void; className?: string }> = ({
    label,
    onClick,
    className,
}) => {
    const isMobileDevice = useIsMobileDevice();
    return (
        <div
            className={twMerge(
                'h-12 relative flex justify-center items-center font-semibold text-xl border-[3px] rounded-2xl',
                'border-secondary-light dark:border-secondary-dark shadow-md',
                'active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark dark:active:text-popup-light',
                !isMobileDevice ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : '',
                className
            )}
            onClick={(e) => {
                e.preventDefault();
                onClick();
            }}
            onContextMenu={(e) => {
                e.preventDefault();
                onClick();
            }}
        >
            {label}
        </div>
    );
};

export const SplitPaymentPopup: FC<SplitPaymentPopupProps> = ({
    total,
    products,
    paymentMethods,
    mode,
    onCancel,
    onConfirm,
}) => {
    const { closePopup } = usePopup();
    const { currencies, currencyIndex } = useConfig();
    const currency = currencies[currencyIndex];
    const decimals = currency?.decimals ?? 2;

    const [legs, setLegs] = useState<PaymentLeg[]>([]);
    const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
    const [rawValue, setRawValue] = useState('');
    const confirmedRef = useRef(false);

    // Even split state
    const [splitCount, setSplitCount] = useState(2);
    const [evenStep, setEvenStep] = useState(0); // 0 = choosing count, 1 = paying each share

    // Item-pick state
    const [selectedProductIndices, setSelectedProductIndices] = useState<Set<number>>(new Set());
    const [personLabel, setPersonLabel] = useState('Personne 1');

    const regExp = useMemo(() => new RegExp('^\\d*([.]\\d{0,' + decimals + '})?$'), [decimals]);

    const paidAmount = useMemo(() => legs.reduce((sum, l) => sum + l.amount, 0).clean(decimals), [legs, decimals]);
    const remaining = useMemo(() => (total - paidAmount).clean(decimals), [total, paidAmount, decimals]);

    const inputAmount = useMemo(() => {
        const value = parseFloat(rawValue || '0');
        return isNaN(value) ? 0 : value.clean(decimals);
    }, [rawValue, decimals]);

    const isCash = selectedMethod === CASH_KEYWORD;
    const legAmount = useMemo(() => {
        if (!selectedMethod) return 0;
        return Math.min(inputAmount, remaining).clean(decimals);
    }, [inputAmount, remaining, selectedMethod, decimals]);

    const changeDue = useMemo(() => {
        if (!isCash) return 0;
        return (inputAmount - legAmount).clean(decimals);
    }, [isCash, inputAmount, legAmount, decimals]);

    const canAddLeg = selectedMethod !== null && legAmount > 0 && remaining > 0;
    const isComplete = remaining === 0 && legs.length > 0;

    // Even split: per-share amount
    const shareAmount = useMemo(() => {
        if (splitCount <= 0) return 0;
        const raw = total / splitCount;
        return raw.clean(decimals);
    }, [total, splitCount, decimals]);

    // Even split: last share gets the remainder to avoid rounding gaps
    const evenShareAmount = useCallback(
        (index: number) => {
            if (index === splitCount - 1) {
                return (total - legs.reduce((s, l) => s + l.amount, 0)).clean(decimals);
            }
            return shareAmount;
        },
        [splitCount, shareAmount, total, legs, decimals]
    );

    const handleInput = useCallback(
        (key: NumpadKey) => {
            setRawValue((prev) => {
                let next = prev;
                switch (key) {
                    case 'backspace':
                        next = prev.length > 1 ? prev.slice(0, -1) : '';
                        break;
                    case 'clear':
                        next = '';
                        break;
                    case 'exact':
                        next = remaining.toFixed(decimals);
                        break;
                    case '.':
                        if (decimals === 0 || prev.includes('.')) return prev;
                        next = prev === '' ? '0.' : prev + '.';
                        break;
                    case '00': {
                        const candidate = prev === '' || prev === '0' ? '00' : prev + '00';
                        if (regExp.test(candidate)) next = candidate;
                        break;
                    }
                    default: {
                        if (prev === '0') next = key;
                        else {
                            const candidate = prev + key;
                            if (regExp.test(candidate)) next = candidate;
                        }
                    }
                }
                return next;
            });
        },
        [decimals, regExp, remaining]
    );

    const handleAddLeg = useCallback(() => {
        if (!canAddLeg || !selectedMethod) return;
        const leg: PaymentLeg = {
            method: selectedMethod,
            amount: legAmount,
            label: personLabel,
            ...(isCash ? { cashReceived: inputAmount, changeGiven: changeDue } : {}),
        };
        setLegs((prev) => [...prev, leg]);
        setSelectedMethod(null);
        setRawValue('');
        setPersonLabel(`Personne ${legs.length + 2}`);
    }, [canAddLeg, selectedMethod, legAmount, isCash, inputAmount, changeDue, personLabel, legs.length]);

    const handleRemoveLeg = useCallback((index: number) => {
        setLegs((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleConfirm = useCallback(() => {
        if (!isComplete || confirmedRef.current) return;
        confirmedRef.current = true;
        closePopup();
        onConfirm(legs);
    }, [isComplete, closePopup, onConfirm, legs]);

    const handleCancel = useCallback(() => {
        closePopup();
        onCancel();
    }, [closePopup, onCancel]);

    const handleMethodSelect = useCallback(
        (method: string) => {
            setSelectedMethod(method);
            if (mode === 'even' && evenStep === 1) {
                setRawValue(evenShareAmount(legs.length).toFixed(decimals));
            } else {
                setRawValue(remaining.toFixed(decimals));
            }
        },
        [remaining, decimals, mode, evenStep, evenShareAmount, legs.length]
    );

    // Item-pick: compute selected items total
    const selectedItemTotal = useMemo(() => {
        return Array.from(selectedProductIndices)
            .reduce((sum, idx) => sum + (products[idx]?.total ?? 0), 0)
            .clean(decimals);
    }, [selectedProductIndices, products, decimals]);

    const toggleProduct = useCallback((idx: number) => {
        setSelectedProductIndices((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    }, []);

    const handleItemPickConfirm = useCallback(() => {
        if (!selectedMethod || selectedItemTotal <= 0) return;
        const leg: PaymentLeg = {
            method: selectedMethod,
            amount: selectedItemTotal,
            label: personLabel,
            ...(isCash ? { cashReceived: selectedItemTotal, changeGiven: 0 } : {}),
        };
        setLegs((prev) => [...prev, leg]);
        setSelectedMethod(null);
        setSelectedProductIndices(new Set());
        setPersonLabel(`Personne ${legs.length + 2}`);
    }, [selectedMethod, selectedItemTotal, isCash, personLabel, legs.length]);

    const numpadRows: NumpadKey[][] = [
        ['7', '8', '9'],
        ['4', '5', '6'],
        ['1', '2', '3'],
        ['0', '00', '.'],
    ];

    // === EVEN SPLIT: Step 0 — choose number of people ===
    if (mode === 'even' && evenStep === 0) {
        return (
            <div
                className="flex flex-col items-center justify-center w-full max-w-lg mx-auto p-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-full mb-6 p-4 bg-secondary-light dark:bg-secondary-dark rounded-xl text-center">
                    <IconUsers size={48} className="mx-auto mb-2" />
                    <div className="text-sm text-popup-dark/70 dark:text-popup-dark/70 mb-1">Total à diviser</div>
                    <Amount value={total} showZero decimals={decimals} className="text-3xl font-bold" />
                </div>

                <div className="text-sm font-semibold mb-2">Nombre de personnes</div>
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => setSplitCount((n) => Math.max(2, n - 1))}
                        className="w-12 h-12 rounded-full bg-secondary-light dark:bg-secondary-dark text-2xl font-bold cursor-pointer"
                    >
                        −
                    </button>
                    <span className="text-4xl font-bold w-16 text-center">{splitCount}</span>
                    <button
                        onClick={() => setSplitCount((n) => Math.min(20, n + 1))}
                        className="w-12 h-12 rounded-full bg-secondary-light dark:bg-secondary-dark text-2xl font-bold cursor-pointer"
                    >
                        +
                    </button>
                </div>

                <div className="text-sm text-popup-dark/70 dark:text-popup-dark/70 mb-6">
                    Chaque personne paie{' '}
                    <span className="font-bold text-popup-dark dark:text-popup-dark">
                        <Amount value={shareAmount} showZero decimals={decimals} />
                    </span>
                </div>

                <div className="w-full grid grid-cols-2 gap-3">
                    <button
                        onClick={handleCancel}
                        className="flex items-center justify-center gap-2 h-14 rounded-2xl font-bold text-xl bg-red-500 dark:bg-red-600 text-white cursor-pointer"
                    >
                        <IconX size={24} />
                        Annuler
                    </button>
                    <button
                        onClick={() => setEvenStep(1)}
                        className="flex items-center justify-center gap-2 h-14 rounded-2xl font-bold text-xl bg-blue-500 dark:bg-blue-600 text-white cursor-pointer"
                    >
                        Continuer
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="flex flex-col items-center justify-start w-full max-w-2xl mx-auto p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '90vh' }}
        >
            {/* Summary header */}
            <div className="w-full mb-4 p-4 bg-secondary-light dark:bg-secondary-dark rounded-xl">
                <div className="flex justify-between items-baseline mb-2">
                    <span className="text-sm text-popup-dark/70 dark:text-popup-dark/70">Total</span>
                    <Amount value={total} showZero decimals={decimals} className="text-2xl font-bold" />
                </div>
                <div className="flex justify-between items-baseline mb-2">
                    <span className="text-sm text-popup-dark/70 dark:text-popup-dark/70">Encaissé</span>
                    <Amount value={paidAmount} showZero decimals={decimals} className="text-xl font-semibold" />
                </div>
                <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-popup-dark/70 dark:text-popup-dark/70">
                        Reste à payer
                    </span>
                    <Amount
                        value={remaining}
                        showZero
                        decimals={decimals}
                        className={twMerge(
                            'text-2xl font-bold',
                            remaining === 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-orange-600 dark:text-orange-400'
                        )}
                    />
                </div>
            </div>

            {/* Legs already added */}
            {legs.length > 0 && (
                <div className="w-full mb-4 space-y-1">
                    {legs.map((leg, i) => {
                        const Icon = getPaymentIcon(leg.method);
                        return (
                            <div
                                key={i}
                                className="flex items-center justify-between p-2 bg-secondary-light dark:bg-secondary-dark rounded-lg"
                            >
                                <div className="flex items-center gap-2">
                                    <Icon size={20} />
                                    <span className="text-sm font-medium">{leg.method}</span>
                                    {leg.label && (
                                        <span className="text-xs text-popup-dark/50 dark:text-popup-dark/50">
                                            ({leg.label})
                                        </span>
                                    )}
                                    {leg.changeGiven ? (
                                        <span className="text-xs text-green-600 dark:text-green-400">
                                            (monnaie: {leg.changeGiven.toFixed(decimals)})
                                        </span>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Amount value={leg.amount} showZero decimals={decimals} className="font-semibold" />
                                    <button
                                        onClick={() => handleRemoveLeg(i)}
                                        className="text-red-500 hover:text-red-600 cursor-pointer"
                                    >
                                        <IconTrash size={16} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* === ITEM-PICK MODE: product selection === */}
            {mode === 'item-pick' && !selectedMethod && remaining > 0 && (
                <div className="w-full mb-4">
                    <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <IconList size={18} />
                        {personLabel} — Sélectionner les produits
                    </div>
                    <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
                        {products.map((product, idx) => {
                            const isSelected = selectedProductIndices.has(idx);
                            const alreadyPaid = legs.some((l) => l.label === personLabel && l.amount === product.total);
                            return (
                                <button
                                    key={idx}
                                    onClick={() => toggleProduct(idx)}
                                    disabled={alreadyPaid}
                                    className={twMerge(
                                        'w-full flex items-center justify-between p-2 rounded-lg border-2 text-left',
                                        isSelected
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                                            : 'border-secondary-light dark:border-secondary-dark',
                                        alreadyPaid && 'opacity-40 cursor-not-allowed'
                                    )}
                                >
                                    <span className="text-sm truncate">{product.label}</span>
                                    <Amount
                                        value={product.total}
                                        showZero
                                        decimals={decimals}
                                        className="text-sm font-semibold"
                                    />
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex justify-between items-baseline p-2 bg-secondary-light dark:bg-secondary-dark rounded-lg mb-3">
                        <span className="text-sm font-semibold">Sélection</span>
                        <Amount value={selectedItemTotal} showZero decimals={decimals} className="text-lg font-bold" />
                    </div>
                    <div className="text-sm font-semibold mb-2">Mode de paiement</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {paymentMethods.map((method) => {
                            const Icon = getPaymentIcon(method);
                            return (
                                <button
                                    key={method}
                                    onClick={() => handleMethodSelect(method)}
                                    disabled={selectedItemTotal <= 0}
                                    className={twMerge(
                                        'flex items-center gap-2 p-3 rounded-xl border-2 border-secondary-light dark:border-secondary-dark',
                                        'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer',
                                        'font-medium text-sm',
                                        selectedItemTotal <= 0 && 'opacity-50 cursor-not-allowed'
                                    )}
                                >
                                    <Icon size={24} />
                                    <span className="truncate">{method}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Method selection (round-robin / even step 1) */}
            {mode !== 'item-pick' && !selectedMethod && remaining > 0 && (
                <div className="w-full mb-4">
                    <div className="text-sm font-semibold mb-2 text-popup-dark/70 dark:text-popup-dark/70">
                        {mode === 'even'
                            ? `Personne ${legs.length + 1} — Choisir un mode de paiement`
                            : 'Choisir un mode de paiement'}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {paymentMethods.map((method) => {
                            const Icon = getPaymentIcon(method);
                            return (
                                <button
                                    key={method}
                                    onClick={() => handleMethodSelect(method)}
                                    className={twMerge(
                                        'flex items-center gap-2 p-3 rounded-xl border-2 border-secondary-light dark:border-secondary-dark',
                                        'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer',
                                        'font-medium text-sm'
                                    )}
                                >
                                    <Icon size={24} />
                                    <span className="truncate">{method}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Amount entry (when a method is selected) */}
            {selectedMethod && (
                <div className="w-full mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            {(() => {
                                const Icon = getPaymentIcon(selectedMethod);
                                return <Icon size={24} />;
                            })()}
                            <span className="font-semibold">{selectedMethod}</span>
                        </div>
                        <button
                            onClick={() => {
                                setSelectedMethod(null);
                                setRawValue('');
                            }}
                            className="text-sm text-red-500 hover:text-red-600 cursor-pointer"
                        >
                            Changer
                        </button>
                    </div>

                    <div className="w-full p-3 bg-secondary-light dark:bg-secondary-dark rounded-xl mb-3">
                        <div className="flex justify-between items-baseline">
                            <span className="text-sm text-popup-dark/70 dark:text-popup-dark/70">
                                {isCash ? 'Montant reçu' : 'Montant'}
                            </span>
                            <Amount value={inputAmount} showZero decimals={decimals} className="text-2xl font-bold" />
                        </div>
                        {isCash && changeDue > 0 && (
                            <div className="flex justify-between items-baseline mt-1">
                                <span className="text-sm text-green-600 dark:text-green-400">Monnaie à rendre</span>
                                <Amount
                                    value={changeDue}
                                    showZero
                                    decimals={decimals}
                                    className="text-lg font-semibold text-green-600 dark:text-green-400"
                                />
                            </div>
                        )}
                    </div>

                    <div className="w-full grid grid-cols-3 gap-2 mb-3">
                        {numpadRows.map((row) =>
                            row.map((key) => (
                                <KeypadButton
                                    key={key}
                                    label={key === '00' ? '00' : key === '.' ? (decimals === 0 ? '' : '.') : key}
                                    onClick={() => handleInput(key)}
                                    className={decimals === 0 && key === '.' ? 'invisible pointer-events-none' : ''}
                                />
                            ))
                        )}
                        <KeypadButton
                            label="C"
                            onClick={() => handleInput('clear')}
                            className="text-orange-600 dark:text-orange-400"
                        />
                        <KeypadButton label={<IconBackspace size={24} />} onClick={() => handleInput('backspace')} />
                        <KeypadButton label="Exact" onClick={() => handleInput('exact')} />
                    </div>

                    {mode === 'item-pick' ? (
                        <button
                            onClick={handleItemPickConfirm}
                            disabled={selectedItemTotal <= 0}
                            className={twMerge(
                                'w-full flex items-center justify-center gap-2 h-12 rounded-2xl font-bold text-lg cursor-pointer',
                                'bg-blue-500 dark:bg-blue-600 text-white',
                                'active:bg-blue-600 dark:active:bg-blue-700',
                                selectedItemTotal <= 0 && 'opacity-50 cursor-not-allowed'
                            )}
                        >
                            <IconPlus size={20} />
                            Encaisser la sélection
                        </button>
                    ) : (
                        <button
                            onClick={handleAddLeg}
                            disabled={!canAddLeg}
                            className={twMerge(
                                'w-full flex items-center justify-center gap-2 h-12 rounded-2xl font-bold text-lg cursor-pointer',
                                'bg-blue-500 dark:bg-blue-600 text-white',
                                'active:bg-blue-600 dark:active:bg-blue-700',
                                !canAddLeg && 'opacity-50 cursor-not-allowed'
                            )}
                        >
                            <IconPlus size={20} />
                            Ajouter
                        </button>
                    )}
                </div>
            )}

            {/* Bottom action buttons */}
            <div className="w-full grid grid-cols-2 gap-3">
                <button
                    onClick={handleCancel}
                    className={twMerge(
                        'flex items-center justify-center gap-2 h-14 rounded-2xl font-bold text-xl cursor-pointer',
                        'bg-red-500 dark:bg-red-600 text-white',
                        'active:bg-red-600 dark:active:bg-red-700'
                    )}
                >
                    <IconX size={24} />
                    Annuler
                </button>
                <button
                    onClick={handleConfirm}
                    disabled={!isComplete}
                    className={twMerge(
                        'flex items-center justify-center gap-2 h-14 rounded-2xl font-bold text-xl cursor-pointer',
                        'bg-green-500 dark:bg-green-600 text-white',
                        'active:bg-green-600 dark:active:bg-green-700',
                        !isComplete && 'opacity-50 cursor-not-allowed'
                    )}
                >
                    <IconCheck size={24} />
                    Valider
                </button>
            </div>
        </div>
    );
};
