import { FC, MouseEventHandler, useCallback, useEffect, useMemo, useState } from 'react';
import { addElement } from '../contexts/DataProvider';
import { Digits } from '../hooks/useConfig';
import { DataElement, useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { BackspaceIcon } from '../images/BackspaceIcon';
import { BasketIcon } from '../images/BasketIcon';
import { WalletIcon } from '../images/WalletIcon';
import { defaultDate, inventory, maxDecimals, maxValue, paymentMethods } from '../utils/data';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isMobileDevice } from '../utils/mobile';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';
import { takeScreenshot } from '../utils/screenshot';
import { utils, writeFile } from 'xlsx';

interface NumPadButtonProps {
    input: Digits | string;
    onInput(key: Digits | string): void;
    onContextMenu?(e: React.MouseEvent<HTMLDivElement, MouseEvent>): void;
    className?: string;
}

const NumPadButton: FC<NumPadButtonProps> = ({ input, onInput, onContextMenu }) => {
    const onClick = useCallback(() => {
        if (!isFullscreen() && isMobileDevice()) {
            requestFullscreen();
        }
        onInput(input);
    }, [onInput, input]);
    return (
        <div
            className="w-20 h-20 active:bg-lime-300 rounded-2xl border border-lime-500 relative flex justify-center m-3 items-center font-semibold text-3xl border-[3px]"
            onClick={onClick}
            onContextMenu={onContextMenu}
        >
            {input}
        </div>
    );
};

const FunctionButton: FC<NumPadButtonProps> = ({ input, onInput, onContextMenu, className }) => {
    const onClick = useCallback(() => {
        if (!isFullscreen() && isMobileDevice()) {
            requestFullscreen();
        }
        onInput(input);
    }, [onInput, input]);
    return (
        <div className={className} onClick={onClick} onContextMenu={onContextMenu}>
            {input}
        </div>
    );
};

export const NumPad: FC = () => {
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

    const max = maxValue * Math.pow(10, maxDecimals);

    // Hack to avoid differences between the server and the client, generating hydration issues
    const [localTransactions, setLocalTransactions] = useState<
        [{ method: string; amount: number; date: string; products: [DataElement] }] | undefined
    >();
    useEffect(() => {
        setLocalTransactions(transactions);
    }, [transactions]);

    const regExp = useMemo(() => new RegExp('^\\d*([.,]\\d{0,' + maxDecimals + '})?$'), []);

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
            openPopup('Paiement : ' + total.toCurrency(), paymentMethods, addPayment);
        }
    }, [amount, openPopup, total, addPayment]);

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
    }, []);

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
                    amount.toCurrency()
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
                            ht.toCurrency() +
                            '\n' +
                            tva.toCurrency() +
                            '\n' +
                            total.toCurrency()
                        );
                    })
                    .concat([
                        'TOTAL\n' +
                            totalTaxes.ht.toCurrency() +
                            '\n' +
                            totalTaxes.tva.toCurrency() +
                            '\n' +
                            totalTaxes.total.toCurrency(),
                    ])
            )
            .concat([''])
            .concat(
                payments.map(
                    ({ category, quantity, amount }) => category + ' x ' + quantity + ' ==> ' + amount.toCurrency()
                )
            );
    }, [getTaxAmountByCategory, getTaxesByCategory, localTransactions, getTransactionsDetails]);

    const showTransactionsSummary = useCallback(() => {
        if (!localTransactions?.length) return;

        const summary = getTransactionsSummary();
        const categories = getTransactionsDetails()?.categories as [DataElement];
        const totalAmount = localTransactions.reduce((total, transaction) => total + transaction.amount, 0);
        const totalProducts = categories.reduce((total, category) => total + category.quantity, 0);

        openPopup(
            totalProducts + 'pdts | ' + localTransactions.length + 'vts : ' + totalAmount.toCurrency(),
            summary || [''],
            (option, index) => {
                if (!categories?.length || index >= categories.length) {
                    setTimeout(showTransactionsSummary);
                    return;
                }

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
                    ({ label, quantity, amount }) => label + ' x ' + quantity + ' ==> ' + amount.toCurrency()
                );

                setTimeout(() =>
                    openPopup(
                        category.category + ' x' + category.quantity + ': ' + category.amount.toCurrency(),
                        summary,
                        () => setTimeout(showTransactionsSummary)
                    )
                );
            }
        );
    }, [openPopup, localTransactions, getTransactionsDetails, getTransactionsSummary]);

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
                    Montant: amount.toCurrency(),
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
                            Prix: amount.toCurrency(),
                            Quantité: quantity,
                            Total: (amount * quantity).toCurrency(),
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
                        HT: ht.toCurrency(),
                        TVA: tva.toCurrency(),
                        TTC: total.toCurrency(),
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
        [localTransactions]
    );

    const showTransactionsSummaryMenu = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            openPopup(
                'TicketZ ' + defaultDate,
                ["Capture d'écran", 'Email', 'Feuille de calcul', 'Afficher'],
                (option, index) => {
                    switch (index) {
                        case 0:
                            setTimeout(() => {
                                showTransactionsSummary();
                                setTimeout(() => {
                                    takeScreenshot('popup', 'TicketZ ' + defaultDate + '.png').then(() => {
                                        closePopup();
                                    });
                                }, 200);
                            });
                            break;
                        case 1:
                            sendEmail('TicketZ ' + defaultDate, 'TicketZ ' + defaultDate + '.png');
                            break;
                        case 2:
                            downloadData('TicketZ ' + defaultDate);
                            break;
                        case 3:
                            setTimeout(showTransactionsSummary);
                            break;
                        default:
                            console.error('Unhandled index: ' + index);
                    }
                }
            );
        },
        [openPopup, closePopup, showTransactionsSummary, sendEmail, downloadData]
    );

    const multiply = useCallback(() => {
        setQuantity(-1);
    }, [setQuantity]);

    useEffect(() => {
        setAmount(parseInt(value) / Math.pow(10, maxDecimals));
    }, [value, setAmount]);
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
                <div className={f1} onClick={onBackspace} onContextMenu={onBackspace}>
                    <BackspaceIcon />
                </div>
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
                    <div
                        className={sx}
                        onClick={canPay ? onPay : canAddProduct ? () => addProduct(selectedCategory) : () => {}}
                    >
                        {canPay ? <WalletIcon /> : canAddProduct ? <BasketIcon /> : ''}
                    </div>
                </div>
            </div>
        </div>
    );
};
