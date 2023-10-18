import { useCallback, useEffect, useState } from 'react';
import { utils, writeFile } from 'xlsx';
import { DEFAULT_DATE } from '../utils/constants';
import { takeScreenshot } from '../utils/screenshot';
import { sendEmail } from '../utils/sendEmail';
import { useConfig } from './useConfig';
import { DataElement, Transaction, useData } from './useData';
import { usePopup } from './usePopup';

export const useSummary = () => {
    const { currencies, currencyIndex, inventory, shopEmail } = useConfig();
    const { transactions, toCurrency, transactionsFilename } = useData();
    const { openPopup, closePopup } = usePopup();

    const [historicalTransactions, setHistoricalTransactions] = useState<string[]>([]);
    const getHistoricalTransactions = useCallback(() => {
        return Object.keys(localStorage).filter((key) => key.split('_')[0] === transactionsFilename.split('_')[0]);
    }, [transactionsFilename]);
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
            categories: DataElement[]
        ) => {
            const emptyCategory =
                categories
                    .filter(
                        ({ category }) => taxes.find((tax) => tax.categories.includes(category))?.index === undefined
                    )
                    .reduce((total, { amount }) => total + amount, 0) || 0;

            return taxes
                .map(({ index, categories: taxcategories, rate }) => {
                    const total = taxcategories
                        .map((category) => categories.find((c) => c.category === category)?.amount || 0)
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
                .filter((line) => line);
        },
        []
    );

    const getTransactionsDetails = useCallback((transactions: Transaction[]) => {
        const categories: DataElement[] = [];
        const payments: DataElement[] = [];

        transactions.forEach((transaction) => {
            if (!transaction.products.length) return;

            const payment = payments.find((payment) => payment.category === transaction.method);
            if (payment) {
                payment.quantity++;
                payment.amount += transaction.amount;
            } else {
                payments.unshift({
                    category: transaction.method,
                    quantity: 1,
                    amount: transaction.amount,
                });
            }

            transaction.products.forEach((product) => {
                const transaction = categories.find((transaction) => transaction.category === product.category);
                if (transaction) {
                    transaction.quantity += product.quantity;
                    transaction.amount += product.total;
                } else {
                    categories.unshift({
                        category: product.category,
                        quantity: product.quantity,
                        amount: product.total,
                    });
                }
            });
        });

        return { categories, payments };
    }, []);

    const getTransactionsData = useCallback(
        (transactions: Transaction[]) => {
            if (!transactions.length) return { categories: [], payments: [], summary: [] };

            const { categories, payments } = getTransactionsDetails(transactions);
            const taxes = getTaxesByCategory();
            const taxAmount = getTaxAmountByCategory(taxes, categories);
            const totalTaxes = { total: 0, ht: 0, tva: 0 };
            taxAmount.forEach((t) => {
                totalTaxes.total += t?.total ?? 0;
                totalTaxes.ht += t?.ht ?? 0;
                totalTaxes.tva += t?.tva ?? 0;
            });

            return {
                categories: categories,
                payments: payments,
                summary: categories
                    .map(
                        ({ category, quantity, amount }) =>
                            '[T' +
                            (taxes.find((tax) => tax.categories.includes(category))?.index ?? '') +
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
                            .map((t) => {
                                return t
                                    ? 'T' +
                                          (isNaN(t.index) ? '' : t.index) +
                                          ' ' +
                                          t.rate +
                                          '%\n' +
                                          toCurrency(t.ht) +
                                          '\n' +
                                          toCurrency(t.tva) +
                                          '\n' +
                                          toCurrency(t.total)
                                    : '';
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
                            ({ category, quantity, amount }) =>
                                category + ' x ' + quantity + ' ==> ' + toCurrency(amount)
                        ) ?? []
                    ),
            };
        },
        [getTaxAmountByCategory, getTaxesByCategory, getTransactionsDetails, toCurrency]
    );

    const showHistoricalTransactions = useCallback(
        (
            showTransactionsCallback: (transactions: Transaction[], fallback: () => void) => void,
            fallback?: () => void
        ) => {
            if (!historicalTransactions.length) return;

            const items = getHistoricalTransactions()
                .map((key) => key.split('_')[1])
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
                        const transactions = localStorage.getItem(
                            transactionsFilename.split('_')[0] + '_' + items[index]
                        );
                        if (!transactions) return;

                        showTransactionsCallback(JSON.parse(transactions), () =>
                            showHistoricalTransactions(showTransactionsCallback, fallback)
                        );
                    }
                },
                true
            );
        },
        [openPopup, historicalTransactions, getHistoricalTransactions, transactionsFilename]
    );

    const displayCategoryDetails = useCallback(
        (element: DataElement, transactions: Transaction[], fallback?: () => void) => {
            const array: { label: string; quantity: number; amount: number }[] = [];
            transactions.flatMap(({ products }) =>
                products
                    .filter(({ category }) => category === element.category)
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

            const detail = array.map(
                ({ label, quantity, amount }) => label + ' x ' + quantity + ' ==> ' + toCurrency(amount)
            );

            openPopup(
                element.category + ' x' + element.quantity + ': ' + toCurrency(element.amount),
                detail,
                fallback,
                true
            );
        },
        [openPopup, toCurrency]
    );

    const displayPaymentDetails = useCallback(
        (element: DataElement, transactions: Transaction[], fallback?: () => void) => {
            const detail = transactions
                .filter(({ method }) => method === element.category)
                .map(({ products, amount, modifiedDate }) => {
                    return (
                        products.length +
                        ' produit' +
                        (products.length > 1 ? 's' : '') +
                        ' ==> ' +
                        toCurrency(amount) +
                        ' à ' +
                        new Date(modifiedDate).toTimeString().slice(0, 9)
                    );
                });

            openPopup(
                element.category + ' x' + element.quantity + ': ' + toCurrency(element.amount),
                detail,
                fallback,
                true
            );
        },
        [openPopup, toCurrency]
    );

    const showTransactionsSummary = useCallback(
        (newTransactions = transactions, fallback?: () => void) => {
            if (!newTransactions.length) {
                showHistoricalTransactions(showTransactionsSummary);
                return;
            }

            const filteredTransactions = newTransactions.filter(
                (transaction) => transaction.currency.symbol === currencies[currencyIndex].symbol
            );
            const { summary, categories, payments } = getTransactionsData(filteredTransactions);
            const totalProducts = categories.reduce((total, category) => total + category.quantity, 0) ?? 0;
            const totalAmount = filteredTransactions.reduce((total, transaction) => total + transaction.amount, 0);

            openPopup(
                `${totalProducts} produit${totalProducts > 1 ? 's' : ''} | ${filteredTransactions.length} vente${
                    filteredTransactions.length > 1 ? 's' : ''
                } : ${toCurrency(totalAmount)}`,
                summary || [''],
                (index) => {
                    if (index < 0 && fallback) fallback();
                    if (index < 0) return;

                    if (index < categories.length) {
                        displayCategoryDetails(categories[index], filteredTransactions, () =>
                            showTransactionsSummary(newTransactions, fallback)
                        );
                    } else if (index >= summary.length - payments.length) {
                        displayPaymentDetails(
                            payments[index - (summary.length - payments.length)],
                            filteredTransactions,
                            () => showTransactionsSummary(newTransactions, fallback)
                        );
                    } else {
                        openPopup(
                            'TVA',
                            summary.slice(categories.length + 1, -payments.length - 1),
                            () => showTransactionsSummary(newTransactions, fallback),
                            true
                        );
                    }
                },
                true
            );
        },
        [
            openPopup,
            transactions,
            getTransactionsData,
            toCurrency,
            showHistoricalTransactions,
            currencies,
            currencyIndex,
            displayCategoryDetails,
            displayPaymentDetails,
        ]
    );

    const processEmail = useCallback(
        (subject: string) => {
            if (!transactions.length) return;

            const filteredTransactions = transactions.filter(
                (transaction) => transaction.currency.symbol === currencies[currencyIndex].symbol
            );
            const summary = getTransactionsData(filteredTransactions)
                .summary.map((item) => (item.trim() ? item.replaceAll('\n', '     ') : '_'.repeat(50)))
                .join('\n');
            const message =
                'Bonjour,\n\nCi-joint le Ticket Z du ' + new Date().toLocaleDateString() + ' :\n\n' + summary;

            sendEmail(shopEmail, subject, message);
        },
        [getTransactionsData, transactions, currencies, currencyIndex, shopEmail]
    );

    const downloadData = useCallback(
        (fileName: string) => {
            if (!transactions.length) return;

            const getTransactionID = (modifiedDate: number, index: number) => {
                const date = new Date(modifiedDate);
                return [date.getFullYear(), date.getMonth() + 1, date.getDate(), index].join('-');
            };

            const transactionsData = transactions.map((transaction, index) => {
                const date = new Date(transaction.modifiedDate);
                return {
                    ID: getTransactionID(transaction.modifiedDate, index),
                    Montant: toCurrency(transaction),
                    Paiement: transaction.method,
                    Date: date.toLocaleDateString(),
                    Heure: date.toLocaleTimeString(),
                };
            });

            const productData = transactions
                .map(({ products, modifiedDate, currency }, index) => {
                    return products.map(({ category, label, amount, quantity, total }) => {
                        return {
                            Transaction: getTransactionID(modifiedDate, index),
                            Catégorie: category,
                            Produit: label,
                            Prix: toCurrency({ amount: amount, currency: currency }),
                            Quantité: quantity,
                            Total: toCurrency({ amount: total, currency: currency }),
                        };
                    });
                })
                .flatMap((p) => p);

            const { categories } = getTransactionsDetails(transactions);
            const taxes = getTaxesByCategory();
            const taxAmount = getTaxAmountByCategory(taxes, categories);

            const tvaData = taxAmount
                .filter((tax) => tax)
                .map((tax) => {
                    return tax
                        ? {
                              Taux: tax.rate + '%',
                              HT: toCurrency(tax.ht),
                              TVA: toCurrency(tax.tva),
                              TTC: toCurrency(tax.total),
                          }
                        : {};
                })
                .filter((t) => t);

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
        [transactions, toCurrency, getTransactionsDetails, getTaxesByCategory, getTaxAmountByCategory]
    );

    const showTransactionsSummaryMenu = useCallback(() => {
        if (transactions.length) {
            openPopup(
                'TicketZ ' + DEFAULT_DATE,
                [
                    "Capture d'écran",
                    'Email',
                    'Feuille de calcul',
                    historicalTransactions.length ? 'Historique' : '',
                    'Afficher',
                ],
                (index) => {
                    switch (index) {
                        case 0:
                            showTransactionsSummary();
                            setTimeout(() => {
                                takeScreenshot('popup', 'TicketZ ' + DEFAULT_DATE + '.png').then(() => {
                                    openPopup("Capture d'écran", ['La capture a bien été enregistrée'], () => {});
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
                            showHistoricalTransactions(showTransactionsSummary, showTransactionsSummaryMenu);
                            break;
                        case 4:
                            showTransactionsSummary(undefined, showTransactionsSummaryMenu);
                            break;
                        default:
                            return;
                    }
                },
                true
            );
        } else if (historicalTransactions.length) {
            showHistoricalTransactions(showTransactionsSummary);
        }
    }, [
        openPopup,
        closePopup,
        showTransactionsSummary,
        processEmail,
        downloadData,
        transactions,
        historicalTransactions,
        showHistoricalTransactions,
    ]);

    return { showTransactionsSummary, showTransactionsSummaryMenu, historicalTransactions, transactions };
};
