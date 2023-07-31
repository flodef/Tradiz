'use client';

import { FC, MouseEventHandler, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { utils, writeFile } from 'xlsx';
import { addElement, transactionsKeyword, transactionsRegex } from '../contexts/DataProvider';
import { useConfig } from '../hooks/useConfig';
import { DataElement, Transaction, useData } from '../hooks/useData';
import { usePay } from '../hooks/usePay';
import { usePopup } from '../hooks/usePopup';
import { useWindowParam } from '../hooks/useWindowParam';
import { BackspaceIcon } from '../images/BackspaceIcon';
import { BasketIcon } from '../images/BasketIcon';
import { WalletIcon } from '../images/WalletIcon';
import { CATEGORY_SEPARATOR, DEFAULT_DATE } from '../utils/constants';
import { requestFullscreen } from '../utils/fullscreen';
import { takeScreenshot } from '../utils/screenshot';
import { sendEmail } from '../utils/sendEmail';
import { Digits } from '../utils/types';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';

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
            className={
                'w-20 h-20 relative flex justify-center m-3 items-center font-semibold text-3xl border-[3px] rounded-2xl ' +
                'border-secondary-light active:bg-secondary-active-light dark:border-secondary-dark dark:active:bg-secondary-active-dark'
            }
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
    const { currencies, currencyIndex, setCurrencyIndex, inventory } = useConfig();
    const {
        total,
        amount,
        setAmount,
        quantity,
        setQuantity,
        clearAmount,
        clearTotal,
        transactions,
        selectedCategory,
        addProduct,
        toCurrency,
    } = useData();
    const { openPopup, closePopup, isPopupOpen } = usePopup();
    const { Pay, canPay, canAddProduct } = usePay();

    // Hack to avoid differences between the server and the client, generating hydration issues
    const [localTransactions, setLocalTransactions] = useState<[Transaction] | undefined>();
    useEffect(() => {
        setLocalTransactions(transactions);
    }, [transactions]);

    const [historicalTransactions, setHistoricalTransactions] = useState<string[]>();
    const getHistoricalTransactions = useCallback(() => {
        return Object.keys(localStorage).filter((key) => transactionsRegex.test(key));
    }, []);
    useEffect(() => {
        setHistoricalTransactions(getHistoricalTransactions());
    }, [getHistoricalTransactions]);

    const maxDecimals = currencies[currencyIndex].maxDecimals;
    const max = useMemo(
        () => currencies[currencyIndex].maxValue * Math.pow(10, maxDecimals),
        [currencies, currencyIndex, maxDecimals]
    );
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
                    if (total > 0) {
                        openPopup('Supprimer Total ?', ['Oui', 'Non'], (i) => {
                            if (i === 0) {
                                clearTotal();
                            }
                        });
                    } else {
                        clearAmount();
                    }
                    break;
                default:
                    console.error('Unhandled type: ' + e.type);
            }
        },
        [clearAmount, clearTotal, openPopup, total]
    );

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

    const getTransactionsDetails = useCallback((transactions: [Transaction]) => {
        if (!transactions?.length) return;

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

        return { categories, payments };
    }, []);

    const getTransactionsSummary = useCallback(
        (transactions: [Transaction]) => {
            if (!transactions?.length) return;

            const details = getTransactionsDetails(transactions);
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
        },
        [getTaxAmountByCategory, getTaxesByCategory, getTransactionsDetails, toCurrency]
    );
    const showHistoricalTransactions = useCallback(
        (
            showTransactionsCallback: (transactions: [Transaction], fallback: () => void) => void,
            fallback?: () => void
        ) => {
            if (!historicalTransactions?.length) return;

            const items = getHistoricalTransactions()
                .map((key) => key.split(' ')[1])
                .sort()
                .reverse();
            openPopup(
                'Historique',
                items.map((key) =>
                    new Date(key).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    })
                ),
                (index) => {
                    if (index < 0 && fallback) {
                        fallback();
                    } else if (index >= 0) {
                        const transactions = localStorage.getItem(transactionsKeyword + ' ' + items[index]);
                        if (!transactions) return;

                        console.log(transactions);
                        showTransactionsCallback(JSON.parse(transactions), () =>
                            showHistoricalTransactions(showTransactionsCallback, fallback)
                        );
                    }
                },
                true
            );
        },
        [openPopup, historicalTransactions, getHistoricalTransactions]
    );

    const showTransactionsSummary = useCallback(
        (transactions = localTransactions, fallback?: () => void) => {
            if (!transactions?.length) {
                showHistoricalTransactions(showTransactionsSummary);
            } else {
                const summary = getTransactionsSummary(transactions);
                const categories = getTransactionsDetails(transactions)?.categories as [DataElement];
                const totalAmount = transactions.reduce((total, transaction) => total + transaction.amount, 0);
                const totalProducts = categories.reduce((total, category) => total + category.quantity, 0);

                openPopup(
                    `${totalProducts} produit${totalProducts > 1 ? 's' : ''} | ${transactions.length} vente${
                        transactions.length > 1 ? 's' : ''
                    } : ${toCurrency(totalAmount)}`,
                    summary || [''],
                    (index) => {
                        if (index < 0 && fallback) {
                            fallback();
                        } else {
                            if (!categories?.length || index >= categories.length || index < 0) return;

                            const category = categories[index];
                            const array = [] as { label: string; quantity: number; amount: number }[];
                            transactions?.flatMap(({ products }) =>
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
                                () => showTransactionsSummary(transactions, fallback),
                                true
                            );
                        }
                    },
                    true
                );
            }
        },
        [
            openPopup,
            localTransactions,
            getTransactionsDetails,
            getTransactionsSummary,
            toCurrency,
            showHistoricalTransactions,
        ]
    );

    const processEmail = useCallback(
        (subject: string) => {
            if (!localTransactions?.length) return;

            const summary = (getTransactionsSummary(localTransactions) ?? [])
                .map((item) => (item.trim() ? item.replaceAll('\n', '     ') : '_'.repeat(50)))
                .join('\n');
            const message =
                'Bonjour,\n\nCi-joint le Ticket Z du ' + new Date().toLocaleDateString() + ' :\n\n' + summary;

            sendEmail(subject, message);
        },
        [getTransactionsSummary, localTransactions]
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

            if (localTransactions?.length) {
                openPopup(
                    'TicketZ ' + DEFAULT_DATE,
                    ["Capture d'écran", 'Email', 'Feuille de calcul', 'Historique', 'Afficher'],
                    (index) => {
                        const fallback = () => showTransactionsSummaryMenu(e);
                        switch (index) {
                            case 0:
                                showTransactionsSummary();
                                setTimeout(() => {
                                    takeScreenshot('popup', 'TicketZ ' + DEFAULT_DATE + '.png').then(() => {
                                        closePopup();
                                    });
                                }); // Set timeout to give time to the popup to display and the screenshot to be taken
                                break;
                            case 1:
                                processEmail('TicketZ ' + DEFAULT_DATE);
                                closePopup();
                                break;
                            case 2:
                                downloadData('TicketZ ' + DEFAULT_DATE);
                                closePopup();
                                break;
                            case 3:
                                showHistoricalTransactions(showTransactionsSummary, fallback);
                                break;
                            case 4:
                                showTransactionsSummary(undefined, fallback);
                                break;
                            default:
                                return;
                        }
                    },
                    true
                );
            } else if (historicalTransactions?.length) {
                showHistoricalTransactions(showTransactionsSummary);
            }
        },
        [
            openPopup,
            closePopup,
            showTransactionsSummary,
            processEmail,
            downloadData,
            localTransactions,
            historicalTransactions,
            showHistoricalTransactions,
        ]
    );

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
                                break;
                            case 1:
                                Pay();
                                break;
                            default:
                                closePopup(showCurrencies);
                                return;
                        }
                    });
                } else {
                    closePopup();

                    const index = currencies.findIndex(({ label }) => label === option);
                    setCurrencyIndex(index);
                    if (amount) {
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
        setCurrencyIndex,
        total,
        amount,
        setAmount,
        selectedCategory,
        inventory,
        closePopup,
        clearTotal,
        Pay,
    ]);

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

    const color =
        'text-secondary-light active:bg-secondary-active-light dark:text-secondary-dark dark:active:bg-secondary-active-dark';
    const s = 'w-20 h-20 rounded-2xl flex justify-center m-3 items-center text-6xl ';
    const sx = s + (canPay || canAddProduct ? color : 'invisible');

    const f = 'text-5xl w-14 h-14 p-2 rounded-full leading-[0.7] ';
    const f1 = f + (amount || total ? color : 'invisible');
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
                            value={amount * Math.max(quantity, 1)}
                            showZero
                            onClick={showCurrencies}
                        />
                        <ImageButton className={f1} onInput={onBackspace}>
                            <BackspaceIcon />
                        </ImageButton>
                        <FunctionButton className={f2} input="&times;" onInput={multiply} />
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
                            onInput={canPay ? Pay : canAddProduct ? () => addProduct(selectedCategory) : () => {}}
                        >
                            {canPay ? <WalletIcon /> : canAddProduct ? <BasketIcon /> : ''}
                        </ImageButton>
                    </div>
                </div>
            </div>
        </div>
    );
};
