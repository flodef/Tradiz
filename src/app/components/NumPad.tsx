'use client';

import { FC, MouseEventHandler, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Mercurial, State, useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePay } from '../hooks/usePay';
import { usePopup } from '../hooks/usePopup';
import { useSummary } from '../hooks/useSummary';
import { useWindowParam } from '../hooks/useWindowParam';
import { BackspaceIcon } from '../images/BackspaceIcon';
import { BasketIcon } from '../images/BasketIcon';
import { WalletIcon } from '../images/WalletIcon';
import { CATEGORY_SEPARATOR, WAITING_KEYWORD } from '../utils/constants';
import { requestFullscreen } from '../utils/fullscreen';
import { Digits } from '../utils/types';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';

interface NumPadButtonProps {
    input: Digits | string;
    onInput(key: Digits | string): void;
    onContextMenu?: () => void;
    className?: string;
}

const NumPadButton: FC<NumPadButtonProps> = ({ input, onInput }) => {
    const { state } = useConfig();

    const onClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            requestFullscreen();

            if (state !== State.done) return;

            onInput(input);
        },
        [onInput, input, state]
    );

    return (
        <div
            className={
                'w-20 h-20 relative flex justify-center m-3 items-center font-semibold text-3xl border-[3px] rounded-2xl ' +
                'border-secondary-light dark:border-secondary-dark ' +
                (state === State.done ? 'active:bg-secondary-active-light dark:active:bg-secondary-active-dark' : '')
            }
            onClick={onClick}
            onContextMenu={onClick}
        >
            {input}
        </div>
    );
};

const FunctionButton: FC<NumPadButtonProps> = ({ input, onInput, onContextMenu, className }) => {
    const { state } = useConfig();

    const onClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            requestFullscreen();

            if (state !== State.done) return;

            if (e.type === 'click') {
                onInput(input);
            } else if (e.type === 'contextmenu' && onContextMenu) {
                onContextMenu();
            }
        },
        [onInput, onContextMenu, input, state]
    );

    return (
        <div className={className} onClick={onClick} onContextMenu={onClick}>
            {input}
        </div>
    );
};

interface ImageButtonProps {
    children: ReactNode;
    onClick: () => void;
    onContextMenu: () => void;
    className?: string;
}
const ImageButton: FC<ImageButtonProps> = ({ children, onClick, onContextMenu, className }) => {
    const handleClick = useCallback<MouseEventHandler>(() => {
        requestFullscreen();
        onClick();
    }, [onClick]);

    const handleContextMenu = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            requestFullscreen();
            onContextMenu();
        },
        [onContextMenu]
    );

    return (
        <div className={className} onClick={handleClick} onContextMenu={handleContextMenu}>
            {children}
        </div>
    );
};

export const NumPad: FC = () => {
    const { currencies, currencyIndex, setCurrency, inventory, state } = useConfig();
    const {
        total,
        amount,
        setAmount,
        quantity,
        setQuantity,
        computeQuantity,
        toMercurial,
        setCurrentMercurial,
        clearAmount,
        clearTotal,
        selectedCategory,
        addProduct,
        addTransaction: addPayment,
    } = useData();
    const { openPopup, closePopup, isPopupOpen } = usePopup();
    const { pay, canPay, canAddProduct } = usePay();
    const { showTransactionsSummary, showTransactionsSummaryMenu, historicalTransactions, localTransactions } =
        useSummary();

    const maxValue = useMemo(() => currencies[currencyIndex].maxValue, [currencies, currencyIndex]);
    const maxDecimals = useMemo(() => currencies[currencyIndex].maxDecimals, [currencies, currencyIndex]);
    const max = useMemo(() => maxValue * Math.pow(10, maxDecimals), [maxValue, maxDecimals]);
    const regExp = useMemo(() => new RegExp('^\\d*([.,]\\d{0,' + maxDecimals + '})?$'), [maxDecimals]);

    const [value, setValue] = useState('0');
    const onInput = useCallback(
        (key: Digits | string) => {
            if (!quantity) {
                setValue((value) => {
                    let newValue = (value + key).trim().replace(/^0{2,}/, '0');
                    if (newValue) {
                        newValue = /^[.,]/.test(newValue) ? `0${newValue}` : newValue.replace(/^0+(\d)/, '$1');
                        if (regExp.test(newValue)) return parseFloat(newValue) <= max ? newValue : max.toString();
                    }
                    return value;
                });
            } else {
                const newQuantity = parseFloat(
                    quantity > 0 ? (quantity.toString() + key).replace(/^0{2,}/, '0') : key.toString()
                );
                setQuantity(computeQuantity(amount, newQuantity, maxValue));
            }
        },
        [max, regExp, quantity, setQuantity, maxValue, computeQuantity, amount]
    );

    const onClearTotal = useCallback(() => {
        if (total > 0) {
            openPopup('Supprimer Total ?', ['Oui', 'Non'], (i) => {
                if (i === 0) {
                    clearTotal();
                }
            });
        } else {
            clearAmount();
        }
    }, [clearAmount, clearTotal, openPopup, total]);

    const showCurrencies = useCallback(() => {
        if (currencies.length < 2) return;

        openPopup(
            'Changer ' + currencies[currencyIndex].label,
            currencies.filter((_, index) => index !== currencyIndex).map(({ label }) => label),
            (index, option) => {
                if (index === -1) return;

                if (total) {
                    openPopup('Ticket en cours...', ['Effacer le ticket', 'Payer le ticket'], (index) => {
                        switch (index) {
                            case 0:
                                clearTotal();
                                setCurrency(option);
                                break;
                            case 1:
                                pay();
                                break;
                            default:
                                closePopup(showCurrencies);
                                return;
                        }
                    });
                } else {
                    closePopup();

                    setCurrency(option);
                    if (amount) {
                        const index = currencies.findIndex(({ label }) => label === option);
                        const selectedProduct = selectedCategory.split(CATEGORY_SEPARATOR).at(1);
                        setAmount(
                            inventory
                                .find(({ products }) => products.some(({ label }) => label === selectedProduct))
                                ?.products.find(({ label }) => label === selectedProduct)?.prices[index] ?? 0
                        );
                    }
                }
            },
            true
        );
    }, [
        openPopup,
        currencies,
        currencyIndex,
        setCurrency,
        total,
        amount,
        setAmount,
        selectedCategory,
        inventory,
        closePopup,
        clearTotal,
        pay,
    ]);

    const multiply = useCallback(() => {
        setQuantity(-1);
    }, [setQuantity]);

    const mercuriale = useCallback(() => {
        const mercurials = Object.values(Mercurial);
        openPopup('Mercuriale quadratique', mercurials, (index) => {
            if (quantity === 0) {
                multiply();
            }
            setCurrentMercurial(mercurials[index]);
        });
    }, [setCurrentMercurial, openPopup, quantity, multiply]);

    useEffect(() => {
        setAmount(parseInt(value) / Math.pow(10, maxDecimals));
    }, [value, setAmount, maxDecimals]);
    useEffect(() => {
        if (!amount) {
            setValue('0');
        }
    }, [amount]);

    const NumPadList: Digits[][] = [
        [7, 8, 9],
        [4, 5, 6],
        [1, 2, 3],
    ];

    const clickClassName =
        state === State.done ? 'active:bg-secondary-active-light dark:active:bg-secondary-active-dark ' : '';
    const color = clickClassName + 'text-secondary-light dark:text-secondary-dark ';
    const s = 'w-20 h-20 rounded-2xl flex justify-center m-3 items-center text-6xl ';
    const sx = s + (canPay || canAddProduct ? color : 'invisible');

    const f = 'text-5xl w-14 h-14 p-2 rounded-full leading-[0.7] ';
    const f1 = f + (amount || total || selectedCategory ? color : 'invisible');
    const f2 =
        f +
        (quantity ? 'bg-secondary-active-light dark:bg-secondary-active-dark ' : '') +
        (amount ? color : 'invisible');
    const f3 = f + (localTransactions?.length || historicalTransactions?.length ? color : 'invisible');

    const { width, height } = useWindowParam();
    const shouldUseOverflow = useMemo(
        () => (height < 590 && width >= 768) || (height < 660 && width < 768),
        [width, height]
    );
    const left = useMemo(() => Math.max(((width < 768 ? width : width / 2) - 512) / 2, 0), [width]);

    return (
        <div
            className={useAddPopupClass(
                'inset-0 min-w-[375px] w-full self-center absolute bottom-[116px] ' +
                    'md:top-0 md:w-1/2 md:justify-center md:max-w-[50%] ' +
                    (shouldUseOverflow
                        ? isPopupOpen
                            ? ' top-[76px] '
                            : ' top-32 block overflow-auto '
                        : ' flex flex-col justify-center items-center top-20 md:top-0 ')
            )}
        >
            <div className="flex flex-col justify-center items-center w-full">
                <div
                    className={
                        shouldUseOverflow
                            ? isPopupOpen
                                ? 'fixed top-0 right-0  max-w-lg md:right-0 '
                                : 'fixed top-[76px] right-0 max-w-lg md:top-0 md:z-10 md:right-1/2 '
                            : 'static top-0 max-w-lg w-full '
                    }
                    style={{ left: left }}
                >
                    <div className="flex justify-around text-4xl text-center font-bold pt-0 max-w-lg w-full self-center">
                        <Amount
                            className={
                                'min-w-[145px] text-right leading-normal ' +
                                (selectedCategory && !amount ? 'animate-blink' : '')
                            }
                            value={amount * Math.max(toMercurial(quantity), 1)}
                            showZero
                            onClick={showCurrencies}
                        />
                        <ImageButton className={f1} onClick={clearAmount} onContextMenu={onClearTotal}>
                            <BackspaceIcon />
                        </ImageButton>
                        <FunctionButton className={f2} input="&times;" onInput={multiply} onContextMenu={mercuriale} />
                        <FunctionButton
                            className={f3}
                            input="z"
                            onInput={() => showTransactionsSummary()}
                            onContextMenu={showTransactionsSummaryMenu}
                        />
                    </div>
                </div>

                <div
                    className={
                        'max-w-lg w-full self-center md:top-14 overflow-auto bottom-0 ' +
                        (shouldUseOverflow ? (isPopupOpen ? ' top-14 absolute ' : ' top-0 absolute ') : ' static ')
                    }
                >
                    {NumPadList.map((row, index) => (
                        <div className="flex justify-evenly" key={index}>
                            {row.map((input) => (
                                <NumPadButton input={input} onInput={onInput} key={input} />
                            ))}
                        </div>
                    ))}
                    <div className="flex justify-evenly">
                        <NumPadButton input={0} onInput={onInput} />
                        <NumPadButton input={'00'} onInput={onInput} />
                        <ImageButton
                            className={sx}
                            onClick={canPay ? pay : canAddProduct ? () => addProduct(selectedCategory) : () => {}}
                            onContextMenu={canPay ? () => addPayment(WAITING_KEYWORD) : canAddProduct ? pay : () => {}}
                        >
                            {canPay ? <WalletIcon /> : canAddProduct ? <BasketIcon /> : ''}
                        </ImageButton>
                    </div>
                </div>
            </div>
        </div>
    );
};
