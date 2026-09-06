'use client';

import { FC, useCallback, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { IconBackspace, IconCheck, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useConfig } from '../hooks/useConfig';
import { usePopup } from '../hooks/usePopup';
import { useIsMobileDevice } from '../utils/mobile';
import { CASH_KEYWORD } from '../utils/constants';
import { getPaymentIcon } from '../utils/paymentIcons';
import { PaymentLeg } from '../utils/interfaces';
import { Amount } from './Amount';

interface MultiPaymentPopupProps {
    total: number;
    paymentMethods: string[];
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

export const MultiPaymentPopup: FC<MultiPaymentPopupProps> = ({ total, paymentMethods, onCancel, onConfirm }) => {
    const { closePopup } = usePopup();
    const { currencies, currencyIndex } = useConfig();
    const currency = currencies[currencyIndex];
    const decimals = currency?.decimals ?? 2;

    const [legs, setLegs] = useState<PaymentLeg[]>([]);
    const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
    const [rawValue, setRawValue] = useState('');
    const confirmedRef = useRef(false);

    const regExp = useMemo(() => new RegExp('^\\d*([.]\\d{0,' + decimals + '})?$'), [decimals]);

    const paidAmount = useMemo(() => legs.reduce((sum, l) => sum + l.amount, 0).clean(decimals), [legs, decimals]);
    const remaining = useMemo(() => (total - paidAmount).clean(decimals), [total, paidAmount, decimals]);

    const inputAmount = useMemo(() => {
        const value = parseFloat(rawValue || '0');
        return isNaN(value) ? 0 : value.clean(decimals);
    }, [rawValue, decimals]);

    // For cash: the input is the cash received; leg amount = min(cashReceived, remaining)
    // For non-cash: the input is the leg amount directly
    const isCash = selectedMethod === CASH_KEYWORD;
    const legAmount = useMemo(() => {
        if (!selectedMethod) return 0;
        if (isCash) return Math.min(inputAmount, remaining).clean(decimals);
        return Math.min(inputAmount, remaining).clean(decimals);
    }, [inputAmount, remaining, isCash, selectedMethod, decimals]);

    const changeDue = useMemo(() => {
        if (!isCash) return 0;
        return (inputAmount - legAmount).clean(decimals);
    }, [isCash, inputAmount, legAmount, decimals]);

    const canAddLeg = selectedMethod !== null && legAmount > 0 && remaining > 0;
    const isComplete = remaining === 0 && legs.length > 0;

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
            ...(isCash ? { cashReceived: inputAmount, changeGiven: changeDue } : {}),
        };
        setLegs((prev) => [...prev, leg]);
        setSelectedMethod(null);
        setRawValue('');
    }, [canAddLeg, selectedMethod, legAmount, isCash, inputAmount, changeDue]);

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
            setRawValue(remaining.toFixed(decimals));
        },
        [remaining, decimals]
    );

    const numpadRows: NumpadKey[][] = [
        ['7', '8', '9'],
        ['4', '5', '6'],
        ['1', '2', '3'],
        ['0', '00', '.'],
    ];

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

            {/* Method selection (when no method is selected) */}
            {!selectedMethod && remaining > 0 && (
                <div className="w-full mb-4">
                    <div className="text-sm font-semibold mb-2 text-popup-dark/70 dark:text-popup-dark/70">
                        Choisir un mode de paiement
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
                        {!isCash && legAmount > 0 && (
                            <div className="flex justify-between items-baseline mt-1">
                                <span className="text-sm text-popup-dark/70 dark:text-popup-dark/70">
                                    Sera encaissé
                                </span>
                                <Amount
                                    value={legAmount}
                                    showZero
                                    decimals={decimals}
                                    className="text-lg font-semibold"
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
