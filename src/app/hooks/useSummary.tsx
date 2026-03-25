import { useCallback, useMemo, useRef, useState } from 'react';
import { utils, writeFile } from 'xlsx';
import { sendSummaryEmail } from '../actions/email';
import { Shop } from '../contexts/ConfigProvider';
import { BACK_KEYWORD, DELETED_KEYWORD, PRINT_KEYWORD, SEPARATOR, WAITING_KEYWORD } from '../utils/constants';
import { formatFrenchDate, getFormattedDate } from '../utils/date';
import { Currency, DataElement, SyncAction, Transaction } from '../utils/interfaces';
import { printSummary } from '../utils/posPrinter';
import {
    getStorageUsage,
    idbGetAllKeys,
    idbGetTransactions,
    migrateLocalStorageToIDB,
} from '../utils/transactionStore';
import { useConfig } from './useConfig';
import { useData } from './useData';
import { usePopup } from './usePopup';

export type SummaryData = {
    shop: Shop;
    period: string;
    amount: string;
    transactions: Transaction[];
    currency: Currency;
    summary: string[];
};

enum HistoricalPeriod {
    day,
    month,
    year,
}

export const useSummary = () => {
    const { currencies, currencyIndex, inventory, parameters, getPrintersNames, getPrinterAddresses } = useConfig();
    const { transactions, toCurrency, transactionsFilename, isDbConnected, processTransactions } = useData();
    const { openPopup, closePopup, updatePopup } = usePopup();

    const ImportOption = useMemo(
        () => (
            <label className="w-full cursor-pointer font-semibold text-xl pl-3 text-left">
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
        ),
        [processTransactions, closePopup]
    );

    const [historicalKeys, setHistoricalKeys] = useState<string[]>([]);

    const tempTransactions = useRef<Transaction[]>([]);
    const getHistoricalTransactions = useCallback(() => historicalKeys, [historicalKeys]);

    const refreshHistoricalKeys = useCallback(async () => {
        if (!transactionsFilename) {
            setHistoricalKeys([]);
            return;
        }
        const prefix = transactionsFilename.split('_')[0];
        const allKeys = await idbGetAllKeys();
        const matching = allKeys.filter((key) => key.split('_')[0] === prefix);
        console.log('[useSummary] refreshHistoricalKeys:', { prefix, allKeys, matching });
        setHistoricalKeys(matching);
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

    const getTransactionsDate = useCallback(
        (transactions: Transaction[]) =>
            transactions.length
                ? {
                      date: new Date(transactions[0].createdDate),
                      period:
                          Math.abs(transactions[0].createdDate - transactions[transactions.length - 1].createdDate) <
                          86400000
                              ? HistoricalPeriod.day
                              : HistoricalPeriod.month,
                  }
                : { date: new Date(), period: HistoricalPeriod.day },
        []
    );

    const getPeriodDescription = useCallback(
        (transactions: Transaction[]) => {
            const transactionsDate = getTransactionsDate(transactions);

            return transactionsDate.period === HistoricalPeriod.day
                ? transactionsDate.date.toLocaleDateString('fr-FR')
                : 'Mois de ' + transactionsDate.date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        },
        [getTransactionsDate]
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
                    .concat(['TAUX'.padEnd(8) + '\n HT \n TVA \n TTC '])
                    .concat(
                        taxAmount
                            .map((t) => {
                                return t
                                    ? ('T' + (isNaN(t.index) ? '' : t.index) + ' ' + t.rate + '%').padEnd(8) +
                                          '\n' +
                                          toCurrency(t.ht) +
                                          '\n' +
                                          toCurrency(t.tva) +
                                          '\n' +
                                          toCurrency(t.total)
                                    : '';
                            })
                            .concat([
                                'TOTAL'.padEnd(8) +
                                    '\n' +
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

    const showSyncMenu = useCallback(
        (backCallback = closePopup) => {
            if (isDbConnected) {
                // Check if there's data to migrate in localStorage
                const prefix = transactionsFilename?.split('_')[0] ?? '';
                let hasLocalStorageData = false;
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.split('_')[0] === prefix) {
                        hasLocalStorageData = true;
                        break;
                    }
                }

                openPopup(
                    'Synchronisation',
                    ['Synchronisation complète', "Synchronisation d'aujourd'hui", ImportOption]
                        .concat(getHistoricalTransactions().length ? ['Exporter'] : [])
                        .concat(hasLocalStorageData ? ['Migrer localStorage'] : [])
                        .concat(['Stockage', 'Supprimer données locales'])
                        .concat(['', BACK_KEYWORD]),
                    (_, option) => {
                        const action = {
                            'Synchronisation complète': SyncAction.fullsync,
                            "Synchronisation d'aujourd'hui": SyncAction.daysync,
                            Exporter: SyncAction.export,
                        }[option];
                        if (action) {
                            openPopup('Synchronisation', ['Synchronisation en cours...'], () => {}, true);
                            processTransactions(action).then((count) => {
                                refreshHistoricalKeys();
                                openPopup('Synchronisation', [
                                    count > 0
                                        ? `${count} transaction(s) synchronisée(s)`
                                        : 'Aucune transaction à synchroniser',
                                ]);
                            });
                        } else if (option === 'Migrer localStorage') {
                            const prefix = transactionsFilename?.split('_')[0] ?? '';
                            openPopup('Migration', ['Migration en cours...'], () => {}, true);
                            migrateLocalStorageToIDB(prefix).then((count) => {
                                refreshHistoricalKeys();
                                openPopup('Migration', [
                                    count > 0 ? `${count} jeu(x) de transactions migré(s)` : 'Aucune donnée à migrer',
                                ]);
                            });
                        } else if (option === 'Stockage') {
                            getStorageUsage().then((usage) => {
                                openPopup(
                                    'Stockage',
                                    [
                                        `Utilisé : ${usage.usedFormatted}`,
                                        `Disponible : ${usage.quotaFormatted}`,
                                        `Utilisation : ${usage.percentUsed}%`,
                                    ],
                                    () => showSyncMenu(),
                                    true
                                );
                            });
                        } else if (option === 'Supprimer données locales') {
                            openPopup(
                                '⚠️ Attention - Suppression des données',
                                ['Confirmer la suppression', 'Annuler'],
                                (_, confirmOption) => {
                                    if (confirmOption === 'Confirmer la suppression') {
                                        // Clear localStorage
                                        const prefix = transactionsFilename?.split('_')[0] ?? '';
                                        const keysToDelete: string[] = [];
                                        for (let i = 0; i < localStorage.length; i++) {
                                            const key = localStorage.key(i);
                                            if (key && key.split('_')[0] === prefix) {
                                                keysToDelete.push(key);
                                            }
                                        }
                                        keysToDelete.forEach((key) => localStorage.removeItem(key));

                                        // Clear IndexedDB
                                        indexedDB.deleteDatabase('TradizTransactions');

                                        refreshHistoricalKeys();
                                        openPopup('Suppression', ['Données locales supprimées.']);
                                    } else {
                                        showSyncMenu();
                                    }
                                }
                            );
                        } else if (option === BACK_KEYWORD) {
                            backCallback();
                        }
                    },
                    true
                );
            }
        },
        [
            openPopup,
            processTransactions,
            ImportOption,
            isDbConnected,
            getHistoricalTransactions,
            transactionsFilename,
            refreshHistoricalKeys,
            closePopup,
        ]
    );

    const showHistoricalTransactions = useCallback(
        (
            historicalPeriod: HistoricalPeriod,
            menu: () => void,
            showTransactionsCallback: (menu: () => void, fallback?: () => void) => void,
            fallback = closePopup
        ) => {
            const historicalTransactions = getHistoricalTransactions();
            if (!historicalTransactions.length) {
                showSyncMenu();
                return;
            }

            const isDayPeriod = historicalPeriod === HistoricalPeriod.day;
            const isMonthPeriod = historicalPeriod === HistoricalPeriod.month;
            const isYearPeriod = historicalPeriod === HistoricalPeriod.year;

            // Get year start date with default fallback to January 1st
            const yearStartDate = parameters.yearStartDate || { month: 1, day: 1 };

            // For day period, group by month
            if (isDayPeriod) {
                const ARROW = ' ▸';
                const months = historicalTransactions
                    .map((key) => key.split('_')[1] ?? '')
                    .map((key) => key.split('-').slice(0, 2).join('-'))
                    .filter((key, index, array) => key && array.indexOf(key) === index)
                    .sort()
                    .reverse();

                if (!months.length) return;

                const monthEntries = months.map((monthKey) => {
                    return `${new Date(monthKey).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}${ARROW}`;
                });
                monthEntries.push('', BACK_KEYWORD);

                openPopup(
                    'Historique par jour',
                    monthEntries,
                    (index) => {
                        if (index < 0) {
                            fallback();
                            return;
                        }
                        if (index >= months.length) {
                            // Back button
                            fallback();
                            return;
                        }
                        if (index >= 0) {
                            // Expand to show days in this month
                            const selectedMonth = months[index];
                            const daysInMonth = historicalTransactions
                                .map((key) => key.split('_')[1] ?? '')
                                .filter((key) => key.startsWith(selectedMonth))
                                .sort()
                                .reverse();

                            const dayEntries = daysInMonth.map((dayKey) => {
                                return new Date(dayKey).toLocaleDateString(undefined, {
                                    weekday: 'short',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                });
                            });
                            dayEntries.push('', BACK_KEYWORD);

                            updatePopup(
                                `${new Date(selectedMonth).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`,
                                dayEntries,
                                (dayIndex: number) => {
                                    if (dayIndex < 0) {
                                        fallback();
                                        return;
                                    }
                                    if (dayIndex >= daysInMonth.length) {
                                        // Back button - return to month list
                                        showHistoricalTransactions(
                                            HistoricalPeriod.day,
                                            menu,
                                            showTransactionsCallback,
                                            fallback
                                        );
                                        return;
                                    }
                                    // Load transactions for selected day
                                    (async () => {
                                        const key = transactionsFilename.split('_')[0] + '_' + daysInMonth[dayIndex];
                                        const txs = await idbGetTransactions(key);
                                        if (!txs.length) return;
                                        tempTransactions.current = txs;
                                        showTransactionsCallback(menu, () =>
                                            showHistoricalTransactions(
                                                HistoricalPeriod.day,
                                                menu,
                                                showTransactionsCallback,
                                                fallback
                                            )
                                        );
                                    })();
                                }
                            );
                        }
                    },
                    true
                );
                return;
            }

            // For month period, group by year
            if (isMonthPeriod) {
                const ARROW = ' ▸';
                const years = historicalTransactions
                    .map((key) => key.split('_')[1] ?? '')
                    .map((key) => key.split('-')[0])
                    .filter((key, index, array) => key && array.indexOf(key) === index)
                    .sort()
                    .reverse();

                if (!years.length) return;

                const yearEntries = years.map((year) => `${year}${ARROW}`);
                yearEntries.push('', BACK_KEYWORD);

                openPopup(
                    'Historique par mois',
                    yearEntries,
                    (index) => {
                        if (index < 0) {
                            fallback();
                            return;
                        }
                        if (index >= years.length) {
                            // Back button
                            fallback();
                            return;
                        }
                        if (index >= 0) {
                            // Expand to show months in this year
                            const selectedYear = years[index];
                            const monthsInYear = historicalTransactions
                                .map((key) => key.split('_')[1] ?? '')
                                .map((key) => key.split('-').slice(0, 2).join('-'))
                                .filter((key) => key.startsWith(selectedYear))
                                .filter((key, idx, arr) => arr.indexOf(key) === idx)
                                .sort()
                                .reverse();

                            const monthEntries = monthsInYear.map((monthKey) => {
                                return new Date(monthKey).toLocaleDateString(undefined, {
                                    month: 'long',
                                    year: 'numeric',
                                });
                            });
                            monthEntries.push('', BACK_KEYWORD);

                            updatePopup(selectedYear, monthEntries, (monthIndex: number) => {
                                if (monthIndex < 0) {
                                    fallback();
                                    return;
                                }
                                if (monthIndex >= monthsInYear.length) {
                                    // Back button - return to year list
                                    showHistoricalTransactions(
                                        HistoricalPeriod.month,
                                        menu,
                                        showTransactionsCallback,
                                        fallback
                                    );
                                    return;
                                }
                                // Load transactions for selected month
                                (async () => {
                                    const matchingKeys = getHistoricalTransactions().filter((key) =>
                                        key.includes(monthsInYear[monthIndex])
                                    );
                                    tempTransactions.current = [];
                                    for (const key of matchingKeys) {
                                        const txs = await idbGetTransactions(key);
                                        txs.forEach((tx) => tempTransactions.current.push(tx));
                                    }

                                    showTransactionsCallback(menu, () =>
                                        showHistoricalTransactions(
                                            HistoricalPeriod.month,
                                            menu,
                                            showTransactionsCallback,
                                            fallback
                                        )
                                    );
                                })();
                            });
                        }
                    },
                    true
                );
                return;
            }

            const items = historicalTransactions
                .map((key) => key.split('_')[1] ?? '')
                .map((key) => {
                    // For year period, we need to determine fiscal year based on the date
                    if (isYearPeriod) {
                        const [year, month, day] = key.split('-').map(Number);
                        const txDate = new Date(year, month - 1, day);
                        const fiscalYearStart = new Date(year, yearStartDate.month - 1, yearStartDate.day);

                        // If transaction date is before fiscal year start, it belongs to previous fiscal year
                        if (txDate < fiscalYearStart) {
                            return String(year - 1);
                        }
                        return String(year);
                    }
                    return key.split('-')[0]; // Fallback
                })
                .filter((key, index, array) => key && array.indexOf(key) === index)
                .sort()
                .reverse();

            if (!items.length) return;

            const popupTitle = 'Historique par année fiscale';

            const displayItems = items.map((key) => {
                const yearNum = parseInt(key);
                const now = new Date();
                const currentYear = now.getFullYear();
                const yearStart = new Date(currentYear, yearStartDate.month - 1, yearStartDate.day);

                // Check if this is the current fiscal year
                const isCurrent =
                    now >= yearStart
                        ? yearNum === currentYear // We're after the year start date
                        : yearNum === currentYear - 1; // We're before the year start date

                return isCurrent ? `${yearNum} (en cours)` : `${yearNum}`;
            });
            displayItems.push('', BACK_KEYWORD);

            openPopup(
                popupTitle,
                displayItems,
                (index) => {
                    if (index < 0) {
                        fallback();
                    } else if (index >= items.length) {
                        // Back button
                        fallback();
                    } else if (index >= 0) {
                        (async () => {
                            if (isDayPeriod) {
                                // This path is now handled above
                                const key = transactionsFilename.split('_')[0] + '_' + items[index];
                                const txs = await idbGetTransactions(key);
                                if (!txs.length) return;
                                tempTransactions.current = txs;
                            } else if (isYearPeriod) {
                                // For fiscal year, filter by date range
                                const fiscalYear = parseInt(items[index]);
                                const fiscalYearStart = new Date(
                                    fiscalYear,
                                    yearStartDate.month - 1,
                                    yearStartDate.day
                                );
                                const fiscalYearEnd = new Date(
                                    fiscalYear + 1,
                                    yearStartDate.month - 1,
                                    yearStartDate.day - 1
                                );

                                const matchingKeys = getHistoricalTransactions().filter((key) => {
                                    const dateStr = key.split('_')[1];
                                    if (!dateStr) return false;
                                    const [year, month, day] = dateStr.split('-').map(Number);
                                    const txDate = new Date(year, month - 1, day);
                                    return txDate >= fiscalYearStart && txDate <= fiscalYearEnd;
                                });

                                tempTransactions.current = [];
                                for (const key of matchingKeys) {
                                    const txs = await idbGetTransactions(key);
                                    txs.forEach((tx) => tempTransactions.current.push(tx));
                                }
                            } else {
                                // For month period, use simple string matching
                                const matchingKeys = getHistoricalTransactions().filter((key) =>
                                    key.includes(items[index])
                                );
                                tempTransactions.current = [];
                                for (const key of matchingKeys) {
                                    const txs = await idbGetTransactions(key);
                                    txs.forEach((tx) => tempTransactions.current.push(tx));
                                }
                            }

                            showTransactionsCallback(menu, () =>
                                showHistoricalTransactions(historicalPeriod, menu, showTransactionsCallback, fallback)
                            );
                        })();
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
        [
            openPopup,
            getHistoricalTransactions,
            transactionsFilename,
            showSyncMenu,
            parameters.yearStartDate,
            updatePopup,
            closePopup,
        ]
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
                .sort((a, b) => b.createdDate - a.createdDate)
                .map(({ products, amount, modifiedDate }) => {
                    const { frenchDateStr, frenchTimeStr } = formatFrenchDate(new Date(modifiedDate));
                    return (
                        products.length +
                        ' produit' +
                        (products.length > 1 ? 's' : '') +
                        ' ==> ' +
                        toCurrency(amount) +
                        ' le ' +
                        frenchDateStr +
                        ' à ' +
                        frenchTimeStr
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

    const processEmail = useCallback(async () => {
        const filteredTransactions = getFilteredTransactions();
        if (!filteredTransactions.length) return;

        const { summary, payments } = getTransactionsData(filteredTransactions);
        const period = getPeriodDescription(filteredTransactions);
        const amount = toCurrency(payments.reduce((total, payment) => total + payment.amount, 0));

        return await sendSummaryEmail({
            shop: parameters.shop,
            period,
            amount,
            transactions: filteredTransactions,
            currency: currencies[currencyIndex],
            summary,
        });
    }, [
        parameters.shop,
        getTransactionsData,
        getPeriodDescription,
        getFilteredTransactions,
        toCurrency,
        currencies,
        currencyIndex,
    ]);

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
            const { summary } = getTransactionsData(filteredTransactions);

            // Get period description
            const period = getPeriodDescription(filteredTransactions);

            // Print the Ticket Z using server action
            return await printSummary(printerAddresses, {
                shop: parameters.shop,
                period,
                amount: '',
                transactions: filteredTransactions,
                currency: currencies[currencyIndex],
                summary,
            });
        },
        [
            getFilteredTransactions,
            getPeriodDescription,
            getTransactionsData,
            parameters,
            getPrinterAddresses,
            currencies,
            currencyIndex,
        ]
    );

    const showTransactionsSummaryMenu = useCallback(() => {
        const hasTransactions = transactions.length || tempTransactions.current.length;
        const historicalTransactions = getHistoricalTransactions();
        console.log('[useSummary] showTransactionsSummaryMenu:', {
            hasTransactions,
            historicalTransactions,
            isDbConnected,
        });
        if (hasTransactions || isDbConnected) {
            // If no transactions and DB connected, show sync menu directly
            if (!hasTransactions && isDbConnected) {
                showSyncMenu();
                return;
            }

            const transactionsDate = getTransactionsDate(getFilteredTransactions());
            const isDailyPeriod = transactionsDate.period === HistoricalPeriod.day;
            const formattedDate = getFormattedDate(transactionsDate.date, isDailyPeriod ? 3 : 2);
            openPopup(
                'Ticket Z ' + (hasTransactions ? formattedDate : ''),
                (hasTransactions ? ['Email', 'Feuille de calcul'] : [])
                    .concat(hasTransactions ? getPrintersNames() : [])
                    .concat(isDbConnected && hasTransactions && isDailyPeriod ? ['Resynchroniser jour'] : [])
                    .concat(isDbConnected ? ['Menu Synchronisation'] : [])
                    .concat(
                        historicalTransactions.length
                            ? ['Historique par jour', 'Historique par mois', 'Historique par année fiscale']
                            : []
                    )
                    .concat(hasTransactions ? 'Afficher' : []),
                (_, option) => {
                    switch (option.split(SEPARATOR)[0]) {
                        case PRINT_KEYWORD:
                            openPopup('Imprimer', ['Impression en cours...']);
                            printTransactionsSummary(option).then((response) => {
                                if (!response.success) openPopup('Erreur', [response.error || "Impossible d'imprimer"]);
                                else closePopup();
                            });
                            break;
                        case 'Email':
                            openPopup('Email', ['Envoi en cours...']);
                            processEmail().then((success) => {
                                if (success) openPopup('Email', ['Email envoyé à ' + parameters.shop.email]);
                                else openPopup('Erreur', ["Impossible d'envoyer l'email"]);
                            });
                            break;
                        case 'Feuille de calcul':
                            downloadData('TicketZ ' + formattedDate);
                            closePopup();
                            break;
                        case 'Menu Synchronisation':
                            showSyncMenu(showTransactionsSummaryMenu);
                            break;
                        case 'Resynchroniser jour':
                            processTransactions(SyncAction.resync, transactionsDate.date);
                            showTransactionsSummary(showTransactionsSummaryMenu, showTransactionsSummaryMenu);
                            break;
                        case 'Historique par jour':
                        case 'Historique par mois':
                        case 'Historique par année fiscale':
                            if (historicalTransactions.length) {
                                const period =
                                    option === 'Historique par jour'
                                        ? HistoricalPeriod.day
                                        : option === 'Historique par mois'
                                          ? HistoricalPeriod.month
                                          : HistoricalPeriod.year;
                                showHistoricalTransactions(
                                    period,
                                    showTransactionsSummaryMenu,
                                    showTransactionsSummary,
                                    showTransactionsSummaryMenu
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
        getFilteredTransactions,
        showHistoricalTransactions,
        tempTransactions,
        getTransactionsDate,
        isDbConnected,
        showSyncMenu,
        processTransactions,
        getPrintersNames,
        parameters,
    ]);

    return {
        showTransactionsSummary,
        showTransactionsSummaryMenu,
        getHistoricalTransactions,
        refreshHistoricalKeys,
    };
};
