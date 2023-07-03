import { FC, MouseEventHandler, useCallback, useEffect, useMemo, useState } from 'react';
import { Digits } from '../hooks/useConfig';
import { DataElement, useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { BackspaceIcon } from '../images/BackspaceIcon';
import { WalletIcon } from '../images/WalletIcon';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isMobileDevice } from '../utils/mobile';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';

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
    const { total, amount, setAmount, quantity, setQuantity, clearAmount, clearTotal, addPayment, data } = useData();
    const { openPopup } = usePopup();

    maxValue *= Math.pow(10, maxDecimals);

    const [transactions, setTransactions] = useState<
        [{ method: string; amount: number; date: string; products: [DataElement] }] | undefined
    >();
    useEffect(() => {
        setTransactions(data);
    }, [data]);

    const regExp = useMemo(() => new RegExp('^\\d*([.,]\\d{0,' + maxDecimals + '})?$'), [maxDecimals]);

    const [value, setValue] = useState('0');
    const onInput = useCallback(
        (key: Digits | string) => {
            if (!quantity) {
                setValue((value) => {
                    let newValue = (value + key).trim().replace(/^0{2,}/, '0');
                    if (newValue) {
                        newValue = /^[.,]/.test(newValue) ? `0${newValue}` : newValue.replace(/^0+(\d)/, '$1');
                        if (regExp.test(newValue))
                            return parseFloat(newValue) <= maxValue ? newValue : maxValue.toString();
                    }
                    return value;
                });
            } else {
                let newValue = quantity > 0 ? (quantity.toString() + key).replace(/^0{2,}/, '0') : key.toString();
                setQuantity(parseInt(newValue));
            }
        },
        [maxValue, regExp, quantity, setQuantity]
    );

    const onBackspace = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            switch (e.type.toString()) {
                case 'click':
                    clearAmount();
                    break;
                case 'contextmenu':
                    openPopup('Supprimer Total ?', ['Oui', 'Non'], (option) => {
                        if (option === 'Oui') clearTotal();
                    });
                    break;
                default:
                    console.error('Unhandled type: ' + e.type);
            }
        },
        [clearAmount, clearTotal, openPopup]
    );

    const onPay = useCallback(() => {
        if (total && !amount) {
            openPopup('Paiement : ' + total.toFixed(maxDecimals) + '€', paymentMethods, addPayment);
        }
    }, [amount, openPopup, paymentMethods, total, addPayment, maxDecimals]);

    const showTransactionsSummary = useCallback(() => {
        if (!transactions) return;

        const addElement = (array: [DataElement] | undefined, element: DataElement) => {
            if (!array) {
                array = [element];
            } else {
                array.push(element);
            }

            return array;
        };

        let categories: [DataElement] | undefined = undefined;
        let payments: [DataElement] | undefined = undefined;

        transactions.forEach((transaction) => {
            const payment = payments?.find((payment) => payment.category === transaction.method);
            if (payment) {
                payment.quantity++;
                payment.amount += transaction.amount;
            } else {
                payments = addElement(payments, {
                    category: transaction.method,
                    quantity: 1,
                    amount: transaction.amount,
                });
            }

            transaction.products.forEach((product) => {
                const transaction = categories?.find((transaction) => transaction.category === product.category);
                if (transaction) {
                    transaction.quantity += product.quantity;
                    transaction.amount += product.amount * product.quantity;
                } else {
                    categories = addElement(categories, {
                        category: product.category,
                        quantity: product.quantity,
                        amount: product.amount * product.quantity,
                    });
                }
            });
        });

        if (!categories) categories = [{ category: '', quantity: 0, amount: 0 }];
        if (!payments) payments = [{ category: '', quantity: 0, amount: 0 }];

        const totalAmount = transactions.reduce((total, transaction) => total + transaction.amount, 0);
        const totalProducts = categories.reduce((total, category) => total + category.quantity, 0);

        const summary = categories
            ?.map(
                (category) =>
                    category.category + ' x ' + category.quantity + ' ==> ' + category.amount.toFixed(maxDecimals) + '€'
            )
            .concat([''])
            .concat(
                taxes.map((tax) => {
                    const total = tax.categories
                        .map((category) => categories?.find((c) => c.category === category)?.amount || 0)
                        .reduce((total, amount) => total + amount, 0);
                    if (!total) return ' ';

                    const ht = total / (1 + tax.rate / 100);
                    const tva = total - ht;
                    return tax.rate + '%: HT ' + ht.toFixed(maxDecimals) + '€ / TVA ' + tva.toFixed(maxDecimals) + '€';
                })
            )

            .concat([''])
            .concat(
                payments.map(
                    (payment) =>
                        payment.category +
                        ' x ' +
                        payment.quantity +
                        ' ==> ' +
                        payment.amount.toFixed(maxDecimals) +
                        '€'
                )
            );

        openPopup(totalProducts + ' pdts : ' + totalAmount.toFixed(maxDecimals) + '€', summary);
    }, [maxDecimals, openPopup, taxes, transactions]);

    const multiply = useCallback(() => {
        setQuantity(-1);
    }, [setQuantity]);

    useEffect(() => {
        setAmount(parseInt(value) / Math.pow(10, maxDecimals));
    }, [value, maxDecimals, setAmount]);
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

    let sx = 'w-20 h-20 rounded-2xl flex justify-center m-3 items-center text-6xl ';
    const s1 = sx + (total && !amount ? 'active:bg-lime-300 text-lime-500' : 'invisible');

    let f = 'text-5xl w-14 h-14 p-2 rounded-full leading-[0.7] ';
    const f1 = f + (amount || total ? 'active:bg-lime-300 text-lime-500' : 'invisible');
    const f2 = f + (quantity ? 'bg-lime-300 ' : '') + (amount ? 'active:bg-lime-300 text-lime-500' : 'invisible');
    const f3 = f + (transactions ? 'active:bg-lime-300 text-lime-500' : 'invisible');

    return (
        <div className={useAddPopupClass('inset-0 flex flex-col justify-evenly')}>
            <div className="flex justify-around text-4xl text-center font-bold pt-0">
                <Amount
                    className="min-w-[145px] text-right leading-normal"
                    value={amount * Math.max(quantity, 1)}
                    decimals={maxDecimals}
                    showZero
                />
                <div className={f1} onClick={onBackspace} onContextMenu={onBackspace}>
                    <BackspaceIcon />
                </div>
                <FunctionButton className={f2} input="&times;" onInput={multiply} />
                <FunctionButton className={f3} input="z" onInput={showTransactionsSummary} />
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
