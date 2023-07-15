'use client';

import { FC, MouseEventHandler, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { utils, writeFile } from 'xlsx';
import { addElement } from '../contexts/DataProvider';
import { useConfig } from '../hooks/useConfig';
import { DataElement, useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { BackspaceIcon } from '../images/BackspaceIcon';
import { BasketIcon } from '../images/BasketIcon';
import { WalletIcon } from '../images/WalletIcon';
import { DEFAULT_DATE } from '../utils/env';
import { requestFullscreen } from '../utils/fullscreen';
import { takeScreenshot } from '../utils/screenshot';
import { Digits } from '../utils/types';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';
import { QRCode } from './QRCode';
import { PaymentStatus, usePayment } from '../hooks/usePayment';

interface NumPadButtonProps {
    input: Digits | string;
    onInput(key: Digits | string): void;
    onContextMenu?(e: React.MouseEvent<HTMLDivElement, MouseEvent>): void;
    className?: string;
}

const NumPadButton: FC<NumPadButtonProps> = ({ input, onInput }) => {
    const onClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            requestFullscreen();
            onInput(input);
        },
        [onInput, input]
    );

    return (
        <div
            className="w-20 h-20 active:bg-lime-300 rounded-2xl border-lime-500 relative flex justify-center m-3 items-center font-semibold text-3xl border-[3px]"
            onClick={onClick}
            onContextMenu={onClick}
        >
            {input}
        </div>
    );
};

const FunctionButton: FC<NumPadButtonProps> = ({ input, onInput, onContextMenu, className }) => {
    const onClick = useCallback(() => {
        requestFullscreen();
        onInput(input);
    }, [onInput, input]);

    return (
        <div className={className} onClick={onClick} onContextMenu={onContextMenu}>
            {input}
        </div>
    );
};

interface ImageButtonProps {
    children: ReactNode;
    onInput(e: any): void;
    className?: string;
}
const ImageButton: FC<ImageButtonProps> = ({ children, onInput, className }) => {
    const onClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            requestFullscreen();
            onInput(e);
        },
        [onInput]
    );

    return (
        <div className={className} onClick={onClick} onContextMenu={onClick}>
            {children}
        </div>
    );
};

export const NumPad: FC = () => {
    const { maxValue, maxDecimals, paymentMethods, inventory, toCurrency } = useConfig();
    const {
        total,
        amount,
        setAmount,
        quantity,
        setQuantity,
        clearAmount,
        clearTotal,
        addPayment,
        transactions,
        selectedCategory,
        addProduct,
    } = useData();
    const { openPopup, closePopup } = usePopup();
    const { generate, paymentStatus, error, retry } = usePayment();

    const max = maxValue * Math.pow(10, maxDecimals);

    // Hack to avoid differences between the server and the client, generating hydration issues
    const [localTransactions, setLocalTransactions] = useState<
        [{ method: string; amount: number; date: string; products: [DataElement] }] | undefined
    >();
    useEffect(() => {
        setLocalTransactions(transactions);
    }, [transactions]);

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
                let newValue = quantity > 0 ? (quantity.toString() + key).replace(/^0{2,}/, '0') : key.toString();
                setQuantity(parseInt(newValue));
            }
        },
        [max, regExp, quantity, setQuantity]
    );

    const onBackspace = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            switch (e.type.toString()) {
                case 'click':
                    clearAmount();
                    break;
                case 'contextmenu':
                    openPopup('Supprimer Total ?', ['Oui', 'Non'], (i) => {
                        if (i === 0) {
                            clearTotal();
                        }
                    });
                    break;
                default:
                    console.error('Unhandled type: ' + e.type);
            }
        },
        [clearAmount, clearTotal, openPopup]
    );

    const openQRCode = useCallback(
        (onCancel: (onConfirm: () => void) => void, onConfirm: () => void) => {
            openPopup(
                'Paiement : ' + toCurrency(total),
                [<QRCode key="QRCode" />],
                () => {
                    const status = paymentStatus.current;
                    paymentStatus.current = PaymentStatus.New;
                    if (status === PaymentStatus.Pending) {
                        onCancel(onConfirm);
                    } else if (status === PaymentStatus.Error) {
                        generate();
                    } else {
                        closePopup();
                        addPayment('Crypto');
                    }
                },
                true
            );
        },
        [addPayment, closePopup, generate, paymentStatus, toCurrency, total, openPopup]
    );

    const cancelOrConfirmPaiement = useCallback(
        (onConfirm: () => void) => {
            openPopup(
                'Paiement : ' + toCurrency(total),
                ['Attendre paiement', 'Annuler paiement'],
                (index) => {
                    if (index === 1) {
                        onConfirm();
                    } else {
                        retry();
                        openQRCode(cancelOrConfirmPaiement, onConfirm);
                    }
                },
                true
            );
        },
        [openPopup, toCurrency, total, openQRCode, retry]
    );

    const onPay = useCallback(() => {
        if (total && !amount) {
            openPopup(
                'Paiement : ' + toCurrency(total),
                paymentMethods,
                (index, option) => {
                    if (index < 0) return;

                    if (option === 'Crypto') {
                        generate();
                        openQRCode(cancelOrConfirmPaiement, onPay);
                    } else {
                        addPayment(option);
                        closePopup();
                    }
                },
                true
            );
        }
    }, [
        amount,
        openPopup,
        closePopup,
        total,
        addPayment,
        paymentMethods,
        toCurrency,
        generate,
        openQRCode,
        cancelOrConfirmPaiement,
    ]);

    useEffect(() => {
        if (error?.message === 'Transaction timed out') {
            cancelOrConfirmPaiement(onPay);
        }
    }, [error, cancelOrConfirmPaiement, onPay]);

    const getTaxesByCategory = useCallback(() => {
        return inventory
            .map(({ rate }) => rate)
            .filter((rate, index, array) => array.indexOf(rate) === index)
            .map((rate, index) => {
                const categories = inventory
                    .filter((tax) => tax.rate === rate)
                    .map(({ category }) => category)
                    .filter((category, index, array) => array.indexOf(category) === index);
                return { index, rate, categories };
            });
    }, [inventory]);

    const getTaxAmountByCategory = useCallback(
        (
            taxes: {
                index: number;
                rate: number;
                categories: string[];
            }[],
            categories: [DataElement] | undefined
        ) => {
            return taxes
                .map(({ index, categories: taxcategories, rate }) => {
                    const total = taxcategories
                        .map((category) => categories?.find((c) => c.category === category)?.amount || 0)
                        .reduce((total, amount) => total + amount, 0);
                    if (!total) return ' ';
                    const ht = total / (1 + rate / 100);
                    const tva = total - ht;

                    return { index, rate, total, ht, tva };
                })
                .filter((line) => line !== ' ') as {
                index: number;
                rate: number;
                total: number;
                ht: number;
                tva: number;
            }[];
        },
        []
    );

    const getTransactionsDetails = useCallback(() => {
        if (!localTransactions?.length) return;

        let categories: [DataElement] | undefined = undefined;
        let payments: [DataElement] | undefined = undefined;

        localTransactions.forEach((transaction) => {
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

        return { categories, payments };
    }, [localTransactions]);

    const getTransactionsSummary = useCallback(() => {
        if (!localTransactions?.length) return;

        const details = getTransactionsDetails();
        const categories = details?.categories as [DataElement];
        const payments = details?.payments as [DataElement];

        const taxes = getTaxesByCategory();
        const taxAmount = getTaxAmountByCategory(taxes, categories);
        let totalTaxes = { total: 0, ht: 0, tva: 0 };
        taxAmount.forEach(({ total, ht, tva }) => {
            totalTaxes.total += total;
            totalTaxes.ht += ht;
            totalTaxes.tva += tva;
        });

        return categories
            ?.map(
                ({ category, quantity, amount }) =>
                    '[T' +
                    taxes?.find((tax) => tax.categories.includes(category))?.index +
                    '] ' +
                    category +
                    ' x ' +
                    quantity +
                    ' ==> ' +
                    toCurrency(amount)
            )
            .concat([''])
            .concat([' TAUX \n HT \n TVA \n TTC '])
            .concat(
                taxAmount
                    .map(({ index, rate, total, ht, tva }) => {
                        return (
                            'T' +
                            index +
                            ' ' +
                            rate +
                            '%\n' +
                            toCurrency(ht) +
                            '\n' +
                            toCurrency(tva) +
                            '\n' +
                            toCurrency(total)
                        );
                    })
                    .concat([
                        'TOTAL\n' +
                            toCurrency(totalTaxes.ht) +
                            '\n' +
                            toCurrency(totalTaxes.tva) +
                            '\n' +
                            toCurrency(totalTaxes.total),
                    ])
            )
            .concat([''])
            .concat(
                payments.map(
                    ({ category, quantity, amount }) => category + ' x ' + quantity + ' ==> ' + toCurrency(amount)
                )
            );
    }, [getTaxAmountByCategory, getTaxesByCategory, localTransactions, getTransactionsDetails, toCurrency]);

    const showTransactionsSummary = useCallback(() => {
        if (!localTransactions?.length) return;

        const summary = getTransactionsSummary();
        const categories = getTransactionsDetails()?.categories as [DataElement];
        const totalAmount = localTransactions.reduce((total, transaction) => total + transaction.amount, 0);
        const totalProducts = categories.reduce((total, category) => total + category.quantity, 0);

        openPopup(
            `${totalProducts} produit${totalProducts > 1 ? 's' : ''} | ${localTransactions.length} vente${
                localTransactions.length > 1 ? 's' : ''
            } : ${toCurrency(totalAmount)}`,
            summary || [''],
            (index) => {
                if (!categories?.length || index >= categories.length || index < 0) return;

                const category = categories[index];
                const array = [] as { label: string; quantity: number; amount: number }[];
                localTransactions?.flatMap(({ products }) =>
                    products
                        .filter((product) => product.category === category.category)
                        .forEach(({ label, quantity, amount }) => {
                            const index = array.findIndex((p) => p.label === label);
                            if (index >= 0) {
                                array[index].quantity += quantity;
                                array[index].amount += quantity * amount;
                            } else {
                                array.push({
                                    label: label || '',
                                    quantity: quantity,
                                    amount: quantity * amount,
                                });
                            }
                        })
                );
                const summary = array.map(
                    ({ label, quantity, amount }) => label + ' x ' + quantity + ' ==> ' + toCurrency(amount)
                );

                openPopup(
                    category.category + ' x' + category.quantity + ': ' + toCurrency(category.amount),
                    summary,
                    showTransactionsSummary,
                    true
                );
            },
            true
        );
    }, [openPopup, localTransactions, getTransactionsDetails, getTransactionsSummary, toCurrency]);

    const sendEmail = useCallback(
        (subject: string, attachment: string) => {
            const summary = (getTransactionsSummary() ?? [])
                .map((item) => (item.trim() ? item.replaceAll('\n', '     ') : '_'.repeat(50)))
                .join('\n');

            const link = document.createElement('a');
            link.href =
                'mailto:?subject=' +
                subject +
                '&body=' +
                encodeURIComponent(
                    'Bonjour,\n\nCi-joint le Ticket Z du ' + new Date().toLocaleDateString() + ' :\n\n'
                ) +
                encodeURIComponent(summary);

            link.href += '&attachment=' + attachment;
            link.target = '_blank';
            link.click();
        },
        [getTransactionsSummary]
    );

    const downloadData = useCallback(
        (fileName: string) => {
            if (!localTransactions?.length) return;

            const transactionsData = localTransactions.map(({ amount, method, date }, index) => {
                return {
                    ID: index,
                    Montant: toCurrency(amount),
                    Paiement: method,
                    Heure: date,
                };
            });

            const productData = localTransactions
                .map(({ products }, index) => {
                    return products.map(({ category, label, amount, quantity }) => {
                        return {
                            TransactionID: index,
                            Catégorie: category,
                            Produit: label,
                            Prix: toCurrency(amount),
                            Quantité: quantity,
                            Total: toCurrency(amount * quantity),
                        };
                    });
                })
                .flatMap((p) => p);

            const tvaData = inventory
                .map(({ category, rate }) => {
                    const total = localTransactions
                        .flatMap(({ products }) => products)
                        .filter(({ category: c }) => c === category)
                        .map(({ amount, quantity }) => amount * quantity)
                        .reduce((total, amount) => total + amount, 0);
                    if (!total) return;

                    const ht = total / (1 + rate / 100);
                    const tva = total - ht;
                    return {
                        Catégorie: category,
                        Taux: rate + '%',
                        HT: toCurrency(ht),
                        TVA: toCurrency(tva),
                        TTC: toCurrency(total),
                    };
                })
                .filter((t) => t) as {
                Catégorie: string;
                Taux: string;
                HT: string;
                TVA: string;
                TTC: string;
            }[];

            const workbook = utils.book_new();
            [
                { name: 'Transactions', data: transactionsData },
                { name: 'Produits', data: productData },
                { name: 'TVA', data: tvaData },
            ].forEach(({ name, data }) => {
                const worksheet = utils.json_to_sheet(data);
                utils.book_append_sheet(workbook, worksheet, name);
            });
            writeFile(workbook, fileName + '.xlsx', { compression: true });
        },
        [localTransactions, inventory, toCurrency]
    );

    const showTransactionsSummaryMenu = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            openPopup(
                'TicketZ ' + DEFAULT_DATE,
                ["Capture d'écran", 'Email', 'Feuille de calcul', 'Afficher'],
                (index) => {
                    switch (index) {
                        case -1:
                            return;
                        case 0:
                            showTransactionsSummary();
                            setTimeout(() => {
                                takeScreenshot('popup', 'TicketZ ' + DEFAULT_DATE + '.png').then(() => {
                                    closePopup();
                                });
                            }); // Set timeout to give time to the popup to display and the screenshot to be taken
                            break;
                        case 1:
                            sendEmail('TicketZ ' + DEFAULT_DATE, 'TicketZ ' + DEFAULT_DATE + '.png');
                            closePopup();
                            break;
                        case 2:
                            downloadData('TicketZ ' + DEFAULT_DATE);
                            closePopup();
                            break;
                        case 3:
                            showTransactionsSummary();
                            break;
                        default:
                            console.error('Unhandled index: ' + index);
                    }
                },
                true
            );
        },
        [openPopup, closePopup, showTransactionsSummary, sendEmail, downloadData]
    );

    const multiply = useCallback(() => {
        setQuantity(-1);
    }, [setQuantity]);

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

    const canPay = useMemo(() => total && !amount && !selectedCategory, [total, amount, selectedCategory]);
    const canAddProduct = useMemo(() => amount && selectedCategory, [amount, selectedCategory]);

    let s = 'w-20 h-20 rounded-2xl flex justify-center m-3 items-center text-6xl ';
    const sx = s + (canPay || canAddProduct ? 'active:bg-lime-300 text-lime-500' : 'invisible');

    let f = 'text-5xl w-14 h-14 p-2 rounded-full leading-[0.7] ';
    const f1 = f + (amount || total ? 'active:bg-lime-300 text-lime-500' : 'invisible');
    const f2 = f + (quantity ? 'bg-lime-300 ' : '') + (amount ? 'active:bg-lime-300 text-lime-500' : 'invisible');
    const f3 = f + (localTransactions ? 'active:bg-lime-300 text-lime-500' : 'invisible');

    return (
        <div
            className={useAddPopupClass(
                'inset-0 flex flex-col justify-evenly min-w-[375px] w-full max-w-lg self-center md:w-1/2 md:absolute md:justify-center md:bottom-[116px] md:max-w-[50%]'
            )}
        >
            <div className="flex justify-around text-4xl text-center font-bold pt-0 max-w-lg w-full self-center">
                <Amount
                    className={
                        'min-w-[145px] text-right leading-normal' +
                        (selectedCategory && !amount ? ' animate-blink ' : '')
                    }
                    value={amount * Math.max(quantity, 1)}
                    showZero
                />
                <ImageButton className={f1} onInput={onBackspace}>
                    <BackspaceIcon />
                </ImageButton>
                <FunctionButton className={f2} input="&times;" onInput={multiply} />
                <FunctionButton
                    className={f3}
                    input="z"
                    onInput={showTransactionsSummary}
                    onContextMenu={showTransactionsSummaryMenu}
                />
            </div>

            <div className="max-w-lg w-full self-center">
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
                        onInput={canPay ? onPay : canAddProduct ? () => addProduct(selectedCategory) : () => {}}
                    >
                        {canPay ? <WalletIcon /> : canAddProduct ? <BasketIcon /> : ''}
                    </ImageButton>
                </div>
            </div>
        </div>
    );
};
