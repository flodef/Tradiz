import { useCallback, useMemo, useRef } from 'react';
import { utils, writeFile } from 'xlsx';
import { DELETED_KEYWORD, PRINT_KEYWORD, SEPARATOR, WAITING_KEYWORD } from '../utils/constants';
import { getFormattedDate } from '../utils/date';
import { printSummary } from '../utils/posPrinter';
import { takeScreenshot } from '../utils/screenshot';
import { sendEmail } from '../utils/sendEmail';
import { useConfig } from './useConfig';
import { DataElement, SyncAction, Transaction, useData } from './useData';
import { usePopup } from './usePopup';

enum HistoricalPeriod {
    day,
    month,
}

export const useSummary = () => {
    const { currencies, currencyIndex, inventory, parameters, getPrintersNames, getPrinterAddresses } = useConfig();
    const { transactions, toCurrency, transactionsFilename, isDbConnected, processTransactions } = useData();
    const { openPopup, closePopup } = usePopup();

    const ImportOption = useMemo(
        () => (
            <>
                <label className="w-full cursor-pointer">
                    Importer
                    <input
                        className="hidden"
                        type="file"
                        accept=".json"
                        multiple={false}
                        onChange={(event) => {
                            processTransactions(SyncAction.import, undefined, event);
                            closePopup();
                        }}
                    />
                </label>
            </>
        ),
        [processTransactions, closePopup]
    );

    const tempTransactions = useRef<Transaction[]>([]);
    const getHistoricalTransactions = useCallback(() => {
        return transactionsFilename
            ? Object.keys(localStorage).filter((key) => key.split('_')[0] === transactionsFilename.split('_')[0])
            : [];
    }, [transactionsFilename]);

    const getFilteredTransactions = useCallback(() => {
        const t = tempTransactions.current.length ? tempTransactions.current : transactions.length ? transactions : [];
        return t.filter(
            (transaction) =>
                transaction.currency === currencies[currencyIndex].label &&
                !!transaction.products.length &&
                transaction.method !== DELETED_KEYWORD &&
                transaction.method !== WAITING_KEYWORD
        );
    }, [currencies, currencyIndex, transactions]);

    const getTransactionDate = useCallback(
        () =>
            tempTransactions.current.length
                ? {
                      date: new Date(tempTransactions.current[0].createdDate),
                      period:
                          Math.abs(
                              tempTransactions.current[0].createdDate -
                                  tempTransactions.current[tempTransactions.current.length - 1].createdDate
                          ) < 86400000
                              ? HistoricalPeriod.day
                              : HistoricalPeriod.month,
                  }
                : { date: new Date(), period: HistoricalPeriod.day },
        []
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
                    transaction.amount += product.total ?? 0;
                } else {
                    categories.unshift({
                        category: product.category,
                        quantity: product.quantity,
                        amount: product.total ?? 0,
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

    const showSyncMenu = useCallback(() => {
        if (isDbConnected) {
            openPopup(
                'Synchronisation',
                ['Synchronisation complète', "Synchronisation d'aujourd'hui", ImportOption].concat(
                    getHistoricalTransactions().length ? ['Exporter'] : []
                ),
                (_, option) => {
                    const action = {
                        'Synchronisation complète': SyncAction.fullsync,
                        "Synchronisation d'aujourd'hui": SyncAction.daysync,
                        Exporter: SyncAction.export,
                    }[option];
                    if (action) {
                        processTransactions(action);
                        closePopup();
                    }
                },
                true
            );
        }
    }, [openPopup, processTransactions, ImportOption, isDbConnected, getHistoricalTransactions, closePopup]);

    const showHistoricalTransactions = useCallback(
        (
            historicalPeriod: HistoricalPeriod,
            menu: () => void,
            showTransactionsCallback: (menu: () => void, fallback?: () => void) => void,
            fallback?: () => void
        ) => {
            const historicalTransactions = getHistoricalTransactions();
            if (!historicalTransactions.length) {
                showSyncMenu();
                return;
            }

            const isDayPeriod = historicalPeriod === HistoricalPeriod.day;
            const items = historicalTransactions
                .map((key) => key.split('_')[1] ?? '')
                .map((key) => (isDayPeriod ? key : key.split('-').slice(0, 2).join('-')))
                .filter((key, index, array) => key && array.indexOf(key) === index)
                .sort()
                .reverse();

            if (!items.length) return;

            openPopup(
                'Historique',
                items.map((key) =>
                    new Date(key).toLocaleDateString(
                        undefined,
                        isDayPeriod
                            ? {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                              }
                            : { month: 'long', year: 'numeric' }
                    )
                ),
                (index) => {
                    if (index < 0 && fallback) {
                        fallback();
                    } else if (index >= 0) {
                        if (isDayPeriod) {
                            const transactions = localStorage.getItem(
                                transactionsFilename.split('_')[0] + '_' + items[index]
                            );
                            if (!transactions) return;

                            tempTransactions.current = JSON.parse(transactions);
                        } else {
                            getHistoricalTransactions()
                                .filter((key) => key.includes(items[index]))
                                .forEach((key) => {
                                    const transactions = localStorage.getItem(key);
                                    if (!transactions) return;

                                    JSON.parse(transactions).forEach((transaction: Transaction) =>
                                        tempTransactions.current.push(transaction)
                                    );
                                });
                        }

                        showTransactionsCallback(menu, () =>
                            showHistoricalTransactions(historicalPeriod, menu, showTransactionsCallback, fallback)
                        );
                    }
                },
                true,
                () =>
                    showHistoricalTransactions(
                        isDayPeriod ? HistoricalPeriod.month : HistoricalPeriod.day,
                        menu,
                        showTransactionsCallback,
                        fallback
                    )
            );
        },
        [openPopup, getHistoricalTransactions, transactionsFilename, showSyncMenu]
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
                            array[index].amount += total ?? 0;
                        } else {
                            array.push({
                                label: label || '',
                                quantity: quantity,
                                amount: total ?? 0,
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
        (menu: () => void, fallback?: () => void) => {
            const filteredTransactions = getFilteredTransactions();
            if (!filteredTransactions.length) {
                showHistoricalTransactions(HistoricalPeriod.month, menu, showTransactionsSummary);
                return;
            }

            const { summary, categories, payments } = getTransactionsData(filteredTransactions);
            const totalProducts = categories.reduce((total, category) => total + category.quantity, 0) ?? 0;
            const totalAmount = filteredTransactions.reduce((total, transaction) => total + transaction.amount, 0);

            openPopup(
                `${totalProducts} produit${totalProducts > 1 ? 's' : ''} | ${filteredTransactions.length} vente${
                    filteredTransactions.length > 1 ? 's' : ''
                } : ${toCurrency(totalAmount)}`,
                summary || [''],
                (index) => {
                    if (index < 0) {
                        tempTransactions.current = [];
                        if (fallback) fallback();
                        return;
                    }

                    if (index < categories.length) {
                        displayCategoryDetails(categories[index], filteredTransactions, () =>
                            showTransactionsSummary(menu, fallback)
                        );
                    } else if (index >= summary.length - payments.length) {
                        displayPaymentDetails(
                            payments[index - (summary.length - payments.length)],
                            filteredTransactions,
                            () => showTransactionsSummary(menu, fallback)
                        );
                    } else {
                        openPopup(
                            'TVA',
                            summary.slice(categories.length + 1, -payments.length - 1),
                            () => showTransactionsSummary(menu, fallback),
                            true
                        );
                    }
                },
                true,
                menu
            );
        },
        [
            openPopup,
            getTransactionsData,
            toCurrency,
            showHistoricalTransactions,
            displayCategoryDetails,
            displayPaymentDetails,
            getFilteredTransactions,
        ]
    );

    const processEmail = useCallback(
        (subject: string) => {
            const filteredTransactions = getFilteredTransactions();
            if (!filteredTransactions.length) return;

            const data = getTransactionsData(filteredTransactions);
            const summary = data.summary
                .map((item) => (item.trim() ? item.replaceAll('\n', '     ') : '_'.repeat(50)))
                .join('\n');
            const message =
                'Bonjour,\n\nCi-joint le Ticket Z du ' +
                (getTransactionDate().period === HistoricalPeriod.day
                    ? getTransactionDate().date.toLocaleDateString()
                    : 'mois de ' +
                      getTransactionDate().date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })) +
                " d'un montant de " +
                toCurrency(data.payments.reduce((total, payment) => total + payment.amount, 0)) +
                ' :\n\n' +
                summary;

            sendEmail(parameters.shop.email, subject, message);
            console.log(subject);
        },
        [getTransactionsData, parameters.shop.email, getTransactionDate, getFilteredTransactions, toCurrency]
    );

    const downloadData = useCallback(
        (fileName: string) => {
            const filteredTransactions = getFilteredTransactions();
            if (!filteredTransactions.length) return;

            const getTransactionID = (modifiedDate: number, index: number) => {
                const date = new Date(modifiedDate);
                return [date.getFullYear(), date.getMonth() + 1, date.getDate(), index].join('-');
            };

            const transactionsData = filteredTransactions.map((transaction, index) => {
                const date = new Date(transaction.modifiedDate);
                return {
                    ID: getTransactionID(transaction.modifiedDate, index),
                    Montant: toCurrency(transaction),
                    Paiement: transaction.method,
                    Date: date.toLocaleDateString(),
                    Heure: date.toLocaleTimeString(),
                };
            });

            const productData = filteredTransactions
                .map(({ products, modifiedDate, currency }, index) => {
                    return products.map(({ category, label, amount, quantity, total }) => {
                        return {
                            Transaction: getTransactionID(modifiedDate, index),
                            Catégorie: category,
                            Produit: label,
                            Prix: toCurrency({ amount: amount, currency: currency }),
                            Quantité: quantity,
                            Total: toCurrency({ amount: total ?? 0, currency: currency }),
                        };
                    });
                })
                .flatMap((p) => p);

            const { categories } = getTransactionsDetails(filteredTransactions);
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
        [toCurrency, getTransactionsDetails, getTaxesByCategory, getTaxAmountByCategory, getFilteredTransactions]
    );

    const printTransactionsSummary = useCallback(
        async (printerName?: string) => {
            const filteredTransactions = getFilteredTransactions();
            if (!filteredTransactions.length) return { error: 'Aucune transaction' };

            const printerAddresses = getPrinterAddresses(printerName);
            if (!printerAddresses.length) return { error: 'Imprimante non trouvée' };

            // Get transaction summary data
            const data = getTransactionsData(filteredTransactions);

            // Get period description
            const periodDesc =
                getTransactionDate().period === HistoricalPeriod.day
                    ? getTransactionDate().date.toLocaleDateString('fr-FR')
                    : 'Mois de ' +
                      getTransactionDate().date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

            // Prepare Ticket Z data
            const ticketZData = {
                shop: parameters.shop,
                period: periodDesc,
                transactions: filteredTransactions,
                summary: data.summary,
            };

            // Print the Ticket Z using server action
            return await printSummary(printerAddresses, ticketZData);
        },
        [getFilteredTransactions, getTransactionDate, getTransactionsData, parameters, getPrinterAddresses]
    );

    const showTransactionsSummaryMenu = useCallback(() => {
        const hasTransactions = transactions.length || tempTransactions.current.length;
        const historicalTransactions = getHistoricalTransactions();
        if (hasTransactions || isDbConnected) {
            const isDailyPeriod = getTransactionDate().period === HistoricalPeriod.day;
            const transactionDate = getTransactionDate().date;
            const formattedDate = getFormattedDate(transactionDate, isDailyPeriod ? 3 : 2);
            openPopup(
                'TicketZ ' + (hasTransactions ? formattedDate : ''),
                (hasTransactions ? ["Capture d'écran", 'Email', 'Feuille de calcul'] : [])
                    .concat(hasTransactions ? getPrintersNames() : [])
                    .concat(isDbConnected && isDailyPeriod ? ['Resynchroniser'] : [])
                    .concat(historicalTransactions.length ? ['Histo jour', 'Histo mois'] : [])
                    .concat(hasTransactions ? 'Afficher' : []),
                (_, option) => {
                    switch (option.split(SEPARATOR)[0]) {
                        case "Capture d'écran":
                            showTransactionsSummary(() => {});
                            setTimeout(() => {
                                takeScreenshot('popup', 'TicketZ ' + formattedDate + '.png').then(() => {
                                    openPopup("Capture d'écran", ['La capture a bien été enregistrée'], () => {});
                                });
                            }); // Set timeout to give time to the popup to display and the screenshot to be taken
                            break;
                        case PRINT_KEYWORD:
                            printTransactionsSummary(option).then((response) => {
                                if (!response.success) openPopup('Erreur', [response.error || "Impossible d'imprimer"]);
                            });
                            closePopup();
                            break;
                        case 'Email':
                            processEmail('TicketZ ' + formattedDate);
                            closePopup();
                            break;
                        case 'Feuille de calcul':
                            downloadData('TicketZ ' + formattedDate);
                            closePopup();
                            break;
                        case 'Resynchroniser':
                            processTransactions(SyncAction.resync, transactionDate);
                            break;
                        case 'Histo jour':
                        case 'Histo mois':
                            if (historicalTransactions.length) {
                                showHistoricalTransactions(
                                    option === 'Histo jour' ? HistoricalPeriod.day : HistoricalPeriod.month,
                                    showTransactionsSummaryMenu,
                                    showTransactionsSummary,
                                    transactions.length ? showTransactionsSummaryMenu : undefined
                                );
                            }
                            break;
                        case 'Afficher':
                            showTransactionsSummary(showTransactionsSummaryMenu, showTransactionsSummaryMenu);
                            break;
                    }
                    tempTransactions.current = [];
                },
                true
            );
        } else {
            showHistoricalTransactions(HistoricalPeriod.month, showTransactionsSummaryMenu, showTransactionsSummary);
        }
    }, [
        openPopup,
        closePopup,
        showTransactionsSummary,
        printTransactionsSummary,
        processEmail,
        downloadData,
        transactions,
        getHistoricalTransactions,
        showHistoricalTransactions,
        tempTransactions,
        getTransactionDate,
        isDbConnected,
        processTransactions,
        getPrintersNames,
    ]);

    return {
        showTransactionsSummary,
        showTransactionsSummaryMenu,
        getHistoricalTransactions,
    };
};
