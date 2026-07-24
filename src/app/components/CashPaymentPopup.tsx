'use client';

import { FC, MouseEventHandler, useCallback, useMemo, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { IconBackspace, IconWallet, IconX } from '@tabler/icons-react';
import { useConfig } from '../hooks/useConfig';
import { usePopup } from '../hooks/usePopup';
import { useIsMobileDevice } from '../utils/mobile';
import { Amount } from './Amount';

interface CashPaymentPopupProps {
    total: number;
    onCancel: () => void;
    onConfirm: (cashAmount: number) => void;
}

type NumpadKey =
    | '1'
    | '2'
    | '3'
    | '4'
    | '5'
    | '6'
    | '7'
    | '8'
    | '9'
    | '0'
    | '00'
    | '.'
    | 'backspace'
    | 'clear'
    | 'exact';

const KeypadButton: FC<{ label: React.ReactNode; onClick: () => void; className?: string }> = ({
    label,
    onClick,
    className,
}) => {
    const isMobileDevice = useIsMobileDevice();
    const handleClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            onClick();
        },
        [onClick]
    );

    return (
        <div
            className={twMerge(
                'h-14 relative flex justify-center items-center font-semibold text-2xl border-[3px] rounded-2xl',
                'border-secondary-light dark:border-secondary-dark shadow-md',
                'active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark dark:active:text-popup-light',
                !isMobileDevice ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : '',
                className
            )}
            onClick={handleClick}
            onContextMenu={handleClick}
        >
            {label}
        </div>
    );
};

export const CashPaymentPopup: FC<CashPaymentPopupProps> = ({ total, onCancel, onConfirm }) => {
    const { closePopup } = usePopup();
    const { currencies, currencyIndex } = useConfig();
    const currency = currencies[currencyIndex];
    const decimals = currency?.decimals ?? 2;
    const [rawValue, setRawValue] = useState('');

    const regExp = useMemo(() => new RegExp('^\\d*([.]\\d{0,' + decimals + '})?$'), [decimals]);

    const cashAmount = useMemo(() => {
        const value = parseFloat(rawValue || '0');
        return isNaN(value) ? 0 : value.clean(decimals);
    }, [rawValue, decimals]);

    const change = useMemo(() => (cashAmount - total).clean(decimals), [cashAmount, total, decimals]);
    const isValid = cashAmount >= total;

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
                        next = total.toFixed(decimals);
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
        [decimals, regExp, total]
    );

    const handleConfirm = useCallback(() => {
        if (!isValid) return;
        closePopup();
        onConfirm(cashAmount);
    }, [isValid, closePopup, onConfirm, cashAmount]);

    const handleCancel = useCallback(() => {
        closePopup();
        onCancel();
    }, [closePopup, onCancel]);

    const numpadRows: NumpadKey[][] = [
        ['7', '8', '9'],
        ['4', '5', '6'],
        ['1', '2', '3'],
        ['0', '00', '.'],
    ];

    return (
        <div
            className="flex flex-col items-center justify-center w-full max-w-lg mx-auto p-4"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="w-full mb-4 p-4 bg-secondary-light dark:bg-secondary-dark rounded-xl">
                <div className="flex justify-between items-center text-sm sm:text-base text-popup-dark/70 dark:text-popup-dark/70 mb-1">
                    <span>Total</span>
                    <span>Montant reçu</span>
                </div>
                <div className="flex justify-between items-baseline font-bold text-3xl sm:text-4xl text-popup-dark dark:text-popup-dark">
                    <Amount value={total} showZero decimals={decimals} />
                    <Amount value={cashAmount} showZero decimals={decimals} />
                </div>
                <div className="flex justify-between items-center mt-2 text-lg sm:text-xl font-semibold text-popup-dark dark:text-popup-dark">
                    <span>À rendre</span>
                    <Amount
                        className={change < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}
                        value={change}
                        showZero
                        decimals={decimals}
                    />
                </div>
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
                <KeypadButton label={<IconBackspace size={28} />} onClick={() => handleInput('backspace')} />
                <KeypadButton label="Exact" onClick={() => handleInput('exact')} />
            </div>

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
                    disabled={!isValid}
                    className={twMerge(
                        'flex items-center justify-center gap-2 h-14 rounded-2xl font-bold text-xl cursor-pointer',
                        'bg-green-500 dark:bg-green-600 text-white',
                        'active:bg-green-600 dark:active:bg-green-700',
                        !isValid && 'opacity-50 cursor-not-allowed'
                    )}
                >
                    <IconWallet size={24} />
                    Valider
                </button>
            </div>
        </div>
    );
};
