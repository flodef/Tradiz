'use client';

import { FC, MouseEventHandler, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyDiscount, Mercurial, useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePay } from '../hooks/usePay';
import { usePopup } from '../hooks/usePopup';
import { useSummary } from '../hooks/useSummary';
import { useWindowParam } from '../hooks/useWindowParam';
import { BackspaceIcon } from '../images/BackspaceIcon';
import { BasketIcon } from '../images/BasketIcon';
import { WalletIcon } from '../images/WalletIcon';
import { IS_LOCAL, WAITING_KEYWORD } from '../utils/constants';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isMobileSize } from '../utils/mobile';
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
    const { isStateReady } = useConfig();

    const onClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();

            if (!isStateReady) return;

            onInput(input);
        },
        [onInput, input, isStateReady]
    );

    return (
        <div
            className={
                'w-20 h-20 relative flex justify-center m-3 items-center font-semibold text-3xl border-[3px] rounded-2xl ' +
                'border-secondary-light dark:border-secondary-dark shadow-xl ' +
                (isStateReady
                    ? 'active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark active:dark:text-popup-light'
                    : '')
            }
            onClick={onClick}
            onContextMenu={onClick}
        >
            {input}
        </div>
    );
};

const FunctionButton: FC<NumPadButtonProps> = ({ input, onInput, onContextMenu, className }) => {
    const { isStateReady } = useConfig();

    const onClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();

            if (!isStateReady) return;

            if (e.type === 'click') {
                onInput(input);
            } else if (e.type === 'contextmenu' && onContextMenu) {
                onContextMenu();
            }
        },
        [onInput, onContextMenu, input, isStateReady]
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
    const handleContextMenu = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            onContextMenu();
        },
        [onContextMenu]
    );

    return (
        <div className={className} onClick={onClick} onContextMenu={handleContextMenu}>
            {children}
        </div>
    );
};

export const NumPad: FC = () => {
    const { currencies, currencyIndex, setCurrency, isStateReady, discounts } = useConfig();
    const {
        total,
        amount,
        setAmount,
        clearAmount,
        quantity,
        setQuantity,
        computeQuantity,
        setDiscount,
        setCurrentMercurial,
        removeProduct,
        clearTotal,
        selectedProduct,
        updateTransaction,
        transactions,
        isDbConnected,
        addProduct: _addProduct,
    } = useData();
    const { openPopup, openFullscreenPopup, closePopup, isPopupOpen } = usePopup();
    const { pay, canPay, canAddProduct } = usePay();
    const { showTransactionsSummary, showTransactionsSummaryMenu, getHistoricalTransactions } = useSummary();

    const maxValue = useMemo(() => currencies[currencyIndex].maxValue, [currencies, currencyIndex]);
    const maxDecimals = useMemo(() => currencies[currencyIndex].maxDecimals, [currencies, currencyIndex]);
    const max = useMemo(() => maxValue * Math.pow(10, maxDecimals), [maxValue, maxDecimals]);
    const regExp = useMemo(() => new RegExp('^\\d*([.,]\\d{0,' + maxDecimals + '})?$'), [maxDecimals]);

    const [value, setValue] = useState('0');

    // Check if the app is in fullscreen otherwise open a popup asking to click for setting it
    const { width, height } = useWindowParam();
    useEffect(() => {
        setTimeout(() => {
            if (
                isStateReady &&
                !isPopupOpen &&
                !isFullscreen() &&
                (height < window.screen.availHeight || width < window.screen.availWidth) &&
                !IS_LOCAL
            ) {
                openFullscreenPopup('Plein écran', ['Mettre en plein écran'], requestFullscreen);
            }
        }, 100);
    }, [openFullscreenPopup, isPopupOpen, height, width, isStateReady, closePopup]);

    const onInput = useCallback(
        (key: Digits | string) => {
            if (!quantity) {
                let newValue = (value + key).trim().replace(/^0{2,}/, '0');
                if (newValue) {
                    newValue = /^[.,]/.test(newValue) ? `0${newValue}` : newValue.replace(/^0+(\d)/, '$1');
                    if (regExp.test(newValue)) {
                        newValue = parseFloat(newValue) <= max ? newValue : max.toString();
                        setValue(newValue);
                        if (selectedProduct) {
                            selectedProduct.amount = parseFloat(newValue) / Math.pow(10, maxDecimals);
                            computeQuantity(selectedProduct, selectedProduct.quantity);
                            setQuantity(0);
                        }
                    }
                }
            } else if (selectedProduct) {
                computeQuantity(
                    selectedProduct,
                    parseFloat(quantity > 0 ? (quantity.toString() + key).replace(/^0{2,}/, '0') : key.toString())
                );
            }
        },
        [max, regExp, quantity, computeQuantity, selectedProduct, value, setValue, maxDecimals, setQuantity]
    );

    const onClear = useCallback(() => {
        if (selectedProduct) {
            if (quantity || !amount) {
                removeProduct();
            } else {
                setAmount(0);
            }
        } else {
            clearAmount();
        }
    }, [removeProduct, clearAmount, selectedProduct, quantity, setAmount, amount]);

    const onClearTotal = useCallback(() => {
        if (total > 0) {
            openPopup('Supprimer commande ?', ['Oui', 'Non'], (i) => {
                if (i === 0) {
                    clearTotal();
                }
            });
        } else {
            removeProduct();
        }
    }, [removeProduct, clearTotal, openPopup, total]);

    const addProduct = useCallback(() => {
        if (selectedProduct?.amount && quantity) {
            computeQuantity(selectedProduct, selectedProduct.quantity + 1);
        } else {
            _addProduct();
        }
    }, [selectedProduct, computeQuantity, _addProduct, quantity]);

    const showCurrencies = useCallback(() => {
        if (currencies.length < 2) return;

        openPopup(
            'Changer ' + currencies[currencyIndex].label + ' pour :',
            currencies.filter((_, index) => index !== currencyIndex).map(({ label }) => label),
            (index, option) => {
                if (index === -1) return;

                if (total) {
                    openPopup(
                        'Ticket en cours...',
                        ['Effacer le ticket', 'Payer le ticket'],
                        (index) => {
                            switch (index) {
                                case 0:
                                    clearTotal();
                                    setCurrency(option);
                                    closePopup();
                                    break;
                                case 1:
                                    pay();
                                    break;
                                default:
                                    closePopup(showCurrencies);
                                    return;
                            }
                        },
                        true
                    );
                } else {
                    closePopup();

                    setCurrency(option);
                    const index = currencies.findIndex(({ label }) => label === option);
                    const maxDecimals = currencies[index].maxDecimals;
                    const amount = selectedProduct?.amount ?? 0;
                    setValue((amount * Math.pow(10, maxDecimals)).toString());
                    setQuantity(0);
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
        setQuantity,
        selectedProduct,
        closePopup,
        clearTotal,
        pay,
    ]);

    const multiply = useCallback(() => {
        if (selectedProduct) {
            computeQuantity(selectedProduct, 1);
        }
        setQuantity(quantity ? 0 : -1);
        setAmount(quantity ? 0 : selectedProduct?.amount ?? 0);
    }, [setQuantity, quantity, computeQuantity, selectedProduct, setAmount]);

    const discount = useCallback(() => {
        if (!discounts.length || !selectedProduct) return;
        const displayDiscounts = (
            discounts.some((discount) => discount.value === 0) ? discounts : [EmptyDiscount].concat(discounts)
        )
            .filter((d) => d !== selectedProduct.discount)
            .sort((a, b) => a.value - b.value);
        openPopup(
            `Remise (${selectedProduct.discount.value ? selectedProduct.discount.value + selectedProduct.discount.unity : 'Aucune'})`,
            displayDiscounts.map((d) => (d.value ? d.value + d.unity : ['Aucune'])),
            (index) => setDiscount(selectedProduct, index < 0 ? selectedProduct.discount : displayDiscounts[index])
        );
    }, [openPopup, selectedProduct, discounts, setDiscount]);

    const mercuriale = useCallback(() => {
        const mercurials = Object.values(Mercurial);
        openPopup('Fonction coût quadratique', mercurials, (index) => {
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

    const color = isStateReady
        ? 'active:bg-secondary-active-light dark:active:bg-secondary-active-dark ' +
          'text-secondary-light dark:text-secondary-dark active:text-popup-dark active:dark:text-popup-light '
        : '';
    const s = 'w-20 h-20 rounded-2xl flex justify-center m-3 items-center text-6xl ';
    const sx = s + (canPay || canAddProduct ? color : 'invisible');

    const f = 'text-5xl w-14 h-14 p-2 rounded-full leading-[0.7] ';
    const f1 = f + (amount || total || selectedProduct ? color : 'invisible');
    const f2 =
        f +
        (amount
            ? quantity
                ? 'bg-secondary-active-light dark:bg-secondary-active-dark text-popup-dark dark:text-popup-light '
                : color
            : 'invisible');
    const f3 = f + (transactions.length || getHistoricalTransactions().length || isDbConnected ? color : 'invisible');

    const shouldUseOverflow = useMemo(
        () => (height < 590 && !isMobileSize()) || (height < 660 && isMobileSize()),
        [height]
    );
    const left = useMemo(() => Math.max(((isMobileSize() ? width : width / 2) - 512) / 2, 0), [width]);

    return (
        <div
            className={useAddPopupClass(
                'inset-0 min-w-[375px] w-full self-center absolute bottom-[116px] ' +
                    'md:top-0 md:w-1/2 md:justify-center md:max-w-[50%] ' +
                    (shouldUseOverflow
                        ? isPopupOpen
                            ? 'top-[76px] '
                            : 'top-32 block overflow-auto '
                        : 'flex flex-col justify-center items-center top-20 md:top-0')
            )}
        >
            <div className="flex flex-col justify-center items-center w-full">
                <div
                    className={
                        shouldUseOverflow
                            ? isPopupOpen
                                ? 'fixed top-0 right-0 max-w-lg md:right-0 '
                                : 'fixed top-[76px] right-0 max-w-lg md:top-0 md:z-10 md:right-1/2 '
                            : 'static max-w-lg w-full '
                    }
                    style={shouldUseOverflow ? { left: left } : {}}
                >
                    <div className="flex justify-around text-4xl text-center font-bold pt-0 max-w-lg w-full self-center">
                        <Amount
                            className={
                                'min-w-[145px] text-right leading-normal ' +
                                (selectedProduct && !amount ? 'animate-blink' : '')
                            }
                            value={selectedProduct?.total ?? amount}
                            showZero
                            onClick={showCurrencies}
                        />
                        <ImageButton className={f1} onClick={onClear} onContextMenu={onClearTotal}>
                            <BackspaceIcon />
                        </ImageButton>
                        <FunctionButton
                            className={f2}
                            input="&times;"
                            onInput={multiply}
                            onContextMenu={discount ?? mercuriale}
                        />
                        <FunctionButton
                            className={f3}
                            input="z"
                            onInput={() => showTransactionsSummary(showTransactionsSummaryMenu)}
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
                            onClick={canPay ? pay : canAddProduct ? addProduct : () => {}}
                            onContextMenu={
                                canPay ? () => updateTransaction(WAITING_KEYWORD) : canAddProduct ? pay : () => {}
                            }
                        >
                            {canPay ? <WalletIcon /> : canAddProduct ? <BasketIcon /> : ''}
                        </ImageButton>
                    </div>
                </div>
            </div>
        </div>
    );
};
