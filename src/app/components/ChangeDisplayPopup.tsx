'use client';

import { FC, MouseEventHandler, useCallback } from 'react';
import { twMerge } from 'tailwind-merge';
import { useConfig } from '../hooks/useConfig';
import { usePopup } from '../hooks/usePopup';
import { useIsMobileDevice } from '../utils/mobile';
import { Amount } from './Amount';

interface ChangeDisplayPopupProps {
    total: number;
    cashAmount: number;
    change: number;
    onClose: () => void;
}

export const ChangeDisplayPopup: FC<ChangeDisplayPopupProps> = ({ total, cashAmount, change, onClose }) => {
    const { closePopup } = usePopup();
    const { currencies, currencyIndex } = useConfig();
    const currency = currencies[currencyIndex];
    const decimals = currency?.decimals ?? 2;
    const isMobileDevice = useIsMobileDevice();

    const handleClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            closePopup();
            onClose();
        },
        [closePopup, onClose]
    );

    return (
        <div
            className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto p-4"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="w-full mb-6 text-center">
                <div className="text-3xl sm:text-4xl font-bold mb-2 text-popup-dark dark:text-popup-dark">
                    Monnaie à rendre
                </div>
                <div className="text-7xl sm:text-9xl font-black text-green-600 dark:text-green-400 my-4">
                    <Amount value={change} showZero decimals={decimals} />
                </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-4 mb-6 text-center text-xl sm:text-2xl font-semibold text-popup-dark dark:text-popup-dark">
                <div className="p-3 bg-secondary-light dark:bg-secondary-dark rounded-xl">
                    <div className="text-sm opacity-70 mb-1">Total</div>
                    <Amount value={total} showZero decimals={decimals} />
                </div>
                <div className="p-3 bg-secondary-light dark:bg-secondary-dark rounded-xl">
                    <div className="text-sm opacity-70 mb-1">Espèces</div>
                    <Amount value={cashAmount} showZero decimals={decimals} />
                </div>
            </div>

            <button
                onClick={handleClick}
                className={twMerge(
                    'w-full h-14 rounded-2xl font-bold text-2xl',
                    'bg-green-500 dark:bg-green-600 text-white',
                    'active:bg-green-600 dark:active:bg-green-700',
                    !isMobileDevice ? 'hover:bg-green-600 dark:hover:bg-green-700 cursor-pointer' : ''
                )}
            >
                OK
            </button>
        </div>
    );
};
