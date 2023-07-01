import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Digits } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { BackspaceIcon } from '../images/BackspaceIcon';
import { WalletIcon } from '../images/WalletIcon';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isMobileDevice } from '../utils/mobile';
import { Amount } from './Amount';
import { addPopupClass } from './Popup';

interface NumPadButtonProps {
    input: Digits | string;
    onInput(key: Digits | string): void;
    className?: string;
}

const NumPadButton: FC<NumPadButtonProps> = ({ input, onInput }) => {
    const onClick = useCallback(() => {
        if (!isFullscreen() && isMobileDevice()) {
            requestFullscreen();
        }
        onInput(input);
    }, [onInput, input]);
    return (
        <div
            className="w-20 h-20 active:bg-lime-300 rounded-2xl border border-lime-500 relative flex justify-center m-3 items-center font-semibold text-3xl"
            style={{ borderWidth: 'medium' }}
            onClick={onClick}
        >
            {input}
        </div>
    );
};

const FunctionButton: FC<NumPadButtonProps> = ({ input, onInput, className }) => {
    const onClick = useCallback(() => {
        if (!isFullscreen() && isMobileDevice()) {
            requestFullscreen();
        }
        onInput(input);
    }, [onInput, input]);
    return (
        <div className={className} onClick={onClick}>
            {input}
        </div>
    );
};

export interface NumPadProps {
    maxDecimals: Digits;
    maxValue: number;
    paymentMethods: string[];
    taxes: {
        rate: number;
        categories: string[];
    }[];
}

export const NumPad: FC<NumPadProps> = ({ maxDecimals, maxValue, paymentMethods, taxes }) => {
    const {
        currentAmount,
        totalAmount,
        numPadValue,
        updateAmount,
        clearAmount,
        clearTotal,
        addPayment,
        categories,
        payments,
    } = useData();
    const { openPopup } = usePopup();

    maxValue *= Math.pow(10, maxDecimals);

    const regExp = useMemo(() => new RegExp('^\\d*([.,]\\d{0,' + maxDecimals + '})?$'), [maxDecimals]);

    const [value, setValue] = useState('0');
    const onInput = useCallback((key: Digits | '.') => {
        setValue((value) => {
            let newValue = (value + key).trim().replace(/^0{2,}/, '0');
            if (newValue) {
                newValue = /^[.,]/.test(newValue) ? `0${newValue}` : newValue.replace(/^0+(\d)/, '$1');
                if (regExp.test(newValue)) return parseFloat(newValue) <= maxValue ? newValue : maxValue.toString();
            }
            return value;
        });
    }, []);

    const onBackspace = useCallback(() => {
        if (currentAmount.current) {
            clearAmount();
        } else if (totalAmount.current) {
            clearTotal();
        }
    }, []);

    const onPay = useCallback(() => {
        if (totalAmount.current && !currentAmount.current) {
            openPopup('Paiement : ' + totalAmount.current + '€', paymentMethods, addPayment);
        }
    }, []);

    const showTransactionsSummary = useCallback(() => {
        if (!categories.current || !payments.current) return;

        const totalAmount = categories.current.reduce((total, category) => total + category.amount, 0);
        const totalTransactions = categories.current.reduce((total, category) => total + category.quantity, 0);
        const summary = categories.current
            .map(
                (category) =>
                    category.category + ' x ' + category.quantity + ' ==> ' + category.amount.toFixed(maxDecimals) + '€'
            )
            .concat([''])
            .concat(
                taxes.map((tax) => {
                    const total = tax.categories
                        .map((category) => categories.current?.find((c) => c.category === category)?.amount || 0)
                        .reduce((total, amount) => total + amount, 0);
                    if (!total) return ' ';

                    const ht = total / (1 + tax.rate / 100);
                    const tva = total - ht;
                    return tax.rate + '%: HT ' + ht.toFixed(maxDecimals) + '€ / TVA ' + tva.toFixed(maxDecimals) + '€';
                })
            )

            .concat([''])
            .concat(
                payments.current.map(
                    (payment) =>
                        payment.category +
                        ' x ' +
                        payment.quantity +
                        ' ==> ' +
                        payment.amount.toFixed(maxDecimals) +
                        '€'
                )
            );

        openPopup(totalTransactions + ' pdts : ' + totalAmount.toFixed(maxDecimals) + '€', summary);
    }, []);

    const multiply = useCallback(() => {}, []);

    useEffect(() => {
        updateAmount(parseInt(value) / Math.pow(10, maxDecimals));
    }, [value, maxDecimals]);
    useEffect(() => {
        if (numPadValue === 0) {
            setValue('0');
        }
    }, [numPadValue]);

    const NumPadList: Digits[][] = [
        [7, 8, 9],
        [4, 5, 6],
        [1, 2, 3],
    ];

    let sx = 'w-20 h-20 rounded-2xl flex justify-center m-3 items-center text-6xl ';
    const s1 = sx + (totalAmount.current && !currentAmount.current ? 'active:bg-lime-300 text-lime-500' : 'invisible');

    let f = 'text-5xl w-14 h-14 p-2 rounded-full leading-[0.7] ';
    const f1 = f + (currentAmount.current || totalAmount.current ? 'active:bg-lime-300 text-lime-500' : 'invisible');
    const f2 = f + (currentAmount.current ? 'active:bg-lime-300 text-lime-500' : 'invisible');
    const f3 = f + (categories.current && payments.current ? 'active:bg-lime-300 text-lime-500' : 'invisible');

    return (
        <div className={addPopupClass('inset-0 flex flex-col justify-evenly')}>
            <div className="flex justify-around text-4xl text-center font-bold pt-0">
                <Amount
                    className="min-w-[145px] text-right leading-normal"
                    value={numPadValue}
                    decimals={maxDecimals}
                    showZero
                />
                <div className={f1} onClick={onBackspace}>
                    <BackspaceIcon />
                </div>
                <FunctionButton className={f2} input="&times;" onInput={multiply} />
                <FunctionButton className={f3} input={payments.current ? 'z' : ''} onInput={showTransactionsSummary} />
            </div>

            <div className="">
                {NumPadList.map((row, index) => (
                    <div className="flex justify-evenly" key={index}>
                        {row.map((input) => (
                            <NumPadButton input={input} onInput={onInput} key={input} />
                        ))}
                    </div>
                ))}
                <div className="flex justify-evenly">
                    {/* <div className={s1}>
                    </div> */}
                    <NumPadButton input={0} onInput={onInput} />
                    <NumPadButton input={'00'} onInput={onInput} />
                    <div className={s1} onClick={onPay}>
                        <WalletIcon />
                    </div>
                </div>
            </div>
        </div>
    );
};
