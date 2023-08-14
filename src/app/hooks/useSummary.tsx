import { MouseEventHandler, useCallback, useEffect, useState } from 'react';
import { utils, writeFile } from 'xlsx';
import { addElement, transactionsKeyword, transactionsRegex } from '../contexts/DataProvider';
import { DEFAULT_DATE } from '../utils/constants';
import { takeScreenshot } from '../utils/screenshot';
import { sendEmail } from '../utils/sendEmail';
import { useConfig } from './useConfig';
import { DataElement, Transaction, useData } from './useData';
import { usePopup } from './usePopup';

export const useSummary = () => {
    const { currencies, currencyIndex, inventory } = useConfig();
    const { transactions, toCurrency } = useData();
    const { openPopup, closePopup } = usePopup();

    // Hack to avoid differences between the server and the client, generating hydration issues
    const [localTransactions, setLocalTransactions] = useState<Transaction[] | undefined>();
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
            categories: DataElement[] | undefined
        ) => {
            const emptyCategory =
                categories
                    ?.filter(
                        ({ category }) => taxes?.find((tax) => tax.categories.includes(category))?.index === undefined
                    )
                    .reduce((total, { amount }) => total + amount, 0) || 0;

            return taxes
                .map(({ index, categories: taxcategories, rate }) => {
                    const total = taxcategories
                        .map((category) => categories?.find((c) => c.category === category)?.amount || 0)
                        .reduce((total, amount) => total + amount, 0);
                    if (!total) return;
                    const ht = total / (1 + rate / 100);
                    const tva = total - ht;

                    return { index, rate, total, ht, tva };
                })
                .concat(
                    emptyCategory
                        ? {
                              index: NaN,
                              rate: 0,
                              total: emptyCategory,
                              ht: emptyCategory,
                              tva: 0,
                          }
                        : undefined
                )
                .filter((line) => line) as {
                index: number;
                rate: number;
                total: number;
                ht: number;
                tva: number;
            }[];
        },
        []
    );

    const getTransactionsDetails = useCallback((transactions: Transaction[]) => {
        if (!transactions?.length) return;

        let categories: DataElement[] | undefined = undefined;
        let payments: DataElement[] | undefined = undefined;

        transactions.forEach((transaction) => {
            if (!transaction.products?.length) return;

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
                    transaction.amount += product.total;
                } else {
                    categories = addElement(categories, {
                        category: product.category,
                        quantity: product.quantity,
                        amount: product.total,
                    });
                }
            });
        });

        return { categories, payments };
    }, []);

    const getTransactionsSummary = useCallback(
        (transactions: Transaction[]) => {
            if (!transactions?.length) return;

            const details = getTransactionsDetails(transactions);
            const categories = details?.categories as DataElement[] | undefined;
            const payments = details?.payments as DataElement[] | undefined;

            const taxes = getTaxesByCategory();
            const taxAmount = getTaxAmountByCategory(taxes, categories);
            const totalTaxes = { total: 0, ht: 0, tva: 0 };
            taxAmount.forEach(({ total, ht, tva }) => {
                totalTaxes.total += total;
                totalTaxes.ht += ht;
                totalTaxes.tva += tva;
            });

            return categories
                ?.map(
                    ({ category, quantity, amount }) =>
                        '[T' +
                        (taxes?.find((tax) => tax.categories.includes(category))?.index ?? '') +
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
                                (isNaN(index) ? '' : index) +
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
                    payments?.map(
                        ({ category, quantity, amount }) => category + ' x ' + quantity + ' ==> ' + toCurrency(amount)
                    ) ?? []
                );
        },
        [getTaxAmountByCategory, getTaxesByCategory, getTransactionsDetails, toCurrency]
    );

    const showHistoricalTransactions = useCallback(
        (
            showTransactionsCallback: (transactions: Transaction[], fallback: () => void) => void,
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
                const currentTransactions = transactions.filter(
                    ({ currency }) => currency.symbol === currencies[currencyIndex].symbol
                );
                const summary = getTransactionsSummary(currentTransactions);
                const categories = getTransactionsDetails(currentTransactions)?.categories as DataElement[] | undefined;
                const totalProducts = categories?.reduce((total, category) => total + category.quantity, 0) ?? 0;
                const totalAmount = currentTransactions.reduce((total, transaction) => total + transaction.amount, 0);

                openPopup(
                    `${totalProducts} produit${totalProducts > 1 ? 's' : ''} | ${currentTransactions.length} vente${
                        currentTransactions.length > 1 ? 's' : ''
                    } : ${toCurrency(totalAmount)}`,
                    summary || [''],
                    (index) => {
                        if (index < 0 && fallback) {
                            fallback();
                        } else {
                            if (!categories?.length || index >= categories.length || index < 0) return;

                            const element = categories[index];
                            const array = [] as { label: string; quantity: number; amount: number }[];
                            transactions?.flatMap(({ products }) =>
                                products
                                    .filter(
                                        ({ category, currency }) =>
                                            category === element.category &&
                                            currency.symbol === currencies[currencyIndex].symbol
                                    )
                                    .forEach(({ label, quantity, total }) => {
                                        const index = array.findIndex((p) => p.label === label);
                                        if (index >= 0) {
                                            array[index].quantity += quantity;
                                            array[index].amount += total;
                                        } else {
                                            array.push({
                                                label: label || '',
                                                quantity: quantity,
                                                amount: total,
                                            });
                                        }
                                    })
                            );

                            const summary = array.map(
                                ({ label, quantity, amount }) => label + ' x ' + quantity + ' ==> ' + toCurrency(amount)
                            );

                            openPopup(
                                element.category + ' x' + element.quantity + ': ' + toCurrency(element.amount),
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
            currencies,
            currencyIndex,
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

            sendEmail('', subject, message);
        },
        [getTransactionsSummary, localTransactions]
    );

    const downloadData = useCallback(
        (fileName: string) => {
            if (!localTransactions?.length) return;

            const transactionsData = localTransactions.map(({ amount, method, date, currency }, index) => {
                return {
                    ID: index,
                    Montant: toCurrency(amount, currency),
                    Paiement: method,
                    Heure: date,
                };
            });

            const productData = localTransactions
                .map(({ products }, index) => {
                    return products.map(({ category, label, amount, quantity, total, currency }) => {
                        return {
                            TransactionID: index,
                            Catégorie: category,
                            Produit: label,
                            Prix: toCurrency(amount, currency),
                            Quantité: quantity,
                            Total: toCurrency(total, currency),
                        };
                    });
                })
                .flatMap((p) => p);

            const tvaData = inventory
                .flatMap(({ category, rate }) => {
                    return currencies
                        .filter(
                            ({ symbol }, index, array) =>
                                array.findIndex((currency) => currency.symbol === symbol) === index
                        )
                        .map((currency) => {
                            const total = localTransactions
                                .flatMap(({ products }) => products)
                                .filter(
                                    ({ category: cat, currency: cur }) =>
                                        cat === category && cur.symbol === currency.symbol
                                )
                                .reduce((t, { total }) => t + total, 0);
                            if (!total) return;

                            const ht = total / (1 + rate / 100);
                            const tva = total - ht;
                            return {
                                Catégorie: category,
                                Taux: rate + '%',
                                HT: toCurrency(ht, currency),
                                TVA: toCurrency(tva, currency),
                                TTC: toCurrency(total, currency),
                            };
                        });
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
        [localTransactions, inventory, toCurrency, currencies]
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

    return { showTransactionsSummary, showTransactionsSummaryMenu, historicalTransactions, localTransactions };
};
