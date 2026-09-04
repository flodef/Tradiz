import { useCallback, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { utils, writeFile } from 'xlsx';
import { sendSummaryEmail } from '../actions/email';
import { Shop } from '../contexts/ConfigProvider';
import {
    isCancelledTransaction,
    isDeletedTransaction,
    isProcessingTransaction,
    isRefundTransaction,
    isWaitingTransaction,
} from '../contexts/dataProvider/transactionHelpers';
import { ARROW, BACK_KEYWORD, DEBIT_KEYWORD, PRINT_KEYWORD, SEPARATOR } from '../utils/constants';
import { formatFrenchDate, getFormattedDate } from '../utils/date';
import { Currency, DataElement, InventoryItem, SyncAction, Transaction } from '../utils/interfaces';
import { printSummary, printTicketX } from '../utils/posPrinter';
import { resolveCashierPrinter } from '../utils/processData';
import { getStorageUsage, idbGetAllKeys, idbGetTransactions } from '../utils/transactionStore';
import { useConfig } from './useConfig';
import { useData } from './useData';
import { usePopup } from './usePopup';

export type ProvisionBreakdownEntry = {
    method: string;
    customerName: string;
    amount: number;
};

export type SummaryData = {
    shop: Shop;
    period: string;
    amount: string;
    transactionCount: number;
    productCount: number;
    totalAmount: number;
    firstTransactionDate: number;
    lastTransactionDate: number;
    currency: Currency;
    summary: string[];
    payments: DataElement[];
    provisionBreakdown: ProvisionBreakdownEntry[];
    debitTotal: number;
    employerShareTotal: number;
    transactions?: Transaction[];
    cancellations?: Transaction[];
    refunds?: Transaction[];
};

enum HistoricalPeriod {
    day,
    month,
    year,
}

export interface SummaryAggregates {
    totalAmount: number;
    transactionCount: number;
    productCount: number;
    firstTransactionDate: number;
    lastTransactionDate: number;
}

export function buildSummaryAggregates(transactions: Transaction[]): SummaryAggregates {
    let totalAmount = 0;
    let transactionCount = 0;
    let productCount = 0;
    let firstTransactionDate = Infinity;
    let lastTransactionDate = -Infinity;

    for (const tx of transactions) {
        totalAmount += tx.amount;
        transactionCount += isRefundTransaction(tx) ? -1 : 1;
        for (const p of tx.products) productCount += p.quantity;
        if (tx.createdDate < firstTransactionDate) firstTransactionDate = tx.createdDate;
        if (tx.createdDate > lastTransactionDate) lastTransactionDate = tx.createdDate;
    }

    return {
        totalAmount,
        transactionCount,
        productCount: Math.round(productCount),
        firstTransactionDate,
        lastTransactionDate,
    };
}

/**
 * Standalone helper that builds a complete `SummaryData` object from a list of
 * transactions.  This is used by the stats page to print a Ticket X without
 * needing the full `useSummary` hook (which depends on `useData` / `usePopup`).
 *
 * `toCurrencyFn` should convert a number to a formatted currency string.
 */
export function buildSummaryData(
    transactions: Transaction[],
    inventory: InventoryItem[],
    currency: Currency,
    shop: Shop,
    toCurrencyFn: (amount: number) => string,
    cancellations?: Transaction[],
    refunds?: Transaction[]
): SummaryData {
    const agg = buildSummaryAggregates(transactions);

    // --- getTransactionsDetails (inlined) ---
    const categories: DataElement[] = [];
    const payments: DataElement[] = [];
    const provisionMap = new Map<string, number>();
    let debitTotal = 0;
    let employerShareTotal = 0;

    for (const transaction of transactions) {
        const isRefund = isRefundTransaction(transaction);
        const payment = payments.find((p) => p.category === transaction.method);
        if (payment) {
            payment.quantity += isRefund ? -1 : 1;
            payment.amount += transaction.amount;
        } else {
            payments.unshift({
                category: transaction.method,
                quantity: isRefund ? -1 : 1,
                amount: transaction.amount,
            });
        }

        if (transaction.method?.toUpperCase() === DEBIT_KEYWORD) {
            debitTotal += transaction.amount;
        }

        if (transaction.employerShare && transaction.employerShare !== 0) {
            employerShareTotal += transaction.employerShare;
        }

        if (transaction.products.length === 0 && transaction.customerName) {
            const key = transaction.method + '\t' + transaction.customerName;
            const existing = provisionMap.get(key);
            if (existing !== undefined) provisionMap.set(key, existing + transaction.amount);
            else provisionMap.set(key, transaction.amount);
        }

        if (transaction.products.length) {
            for (const product of transaction.products) {
                const cat = categories.find((c) => c.category === product.category);
                if (cat) {
                    cat.quantity += product.quantity;
                    cat.amount += product.total ?? 0;
                } else {
                    categories.unshift({
                        category: product.category,
                        quantity: product.quantity,
                        amount: product.total ?? 0,
                    });
                }
            }
        }
    }

    const provisionBreakdown: ProvisionBreakdownEntry[] = [];
    for (const [key, amount] of provisionMap) {
        const [method, customerName] = key.split('\t');
        provisionBreakdown.push({ method, customerName, amount });
    }
    provisionBreakdown.sort((a, b) => a.method.localeCompare(b.method) || a.customerName.localeCompare(b.customerName));

    // --- getTaxesByCategory (inlined) ---
    const taxes = inventory
        .map(({ rate }) => rate)
        .filter((rate, index, array) => array.indexOf(rate) === index)
        .map((rate, index) => {
            const taxCategories = inventory
                .filter((tax) => tax.rate === rate)
                .map(({ category }) => category)
                .filter((category, index, array) => array.indexOf(category) === index);
            return { index, rate, categories: taxCategories };
        });

    // --- getTaxAmountByCategory (inlined) ---
    const emptyCategory =
        categories
            .filter(({ category }) => taxes.find((tax) => tax.categories.includes(category))?.index === undefined)
            .reduce((total, { amount }) => total + amount, 0) || 0;

    const taxAmount = taxes
        .map(({ index, categories: taxCategories, rate }) => {
            const total = taxCategories
                .map((category) => categories.find((c) => c.category === category)?.amount || 0)
                .reduce((total, amount) => total + amount, 0);
            if (!total) return undefined;
            const ht = total / (1 + rate / 100);
            const tva = total - ht;
            return { index, rate, total, ht, tva };
        })
        .concat(emptyCategory ? { index: NaN, rate: 0, total: emptyCategory, ht: emptyCategory, tva: 0 } : undefined)
        .filter((line): line is NonNullable<typeof line> => Boolean(line));

    const totalTaxes = { total: 0, ht: 0, tva: 0 };
    for (const t of taxAmount) {
        totalTaxes.total += t.total;
        totalTaxes.ht += t.ht;
        totalTaxes.tva += t.tva;
    }

    // --- summary lines (inlined from getTransactionsData) ---
    const summary = categories
        .map(
            ({ category, quantity, amount }) =>
                '[T' +
                (taxes.find((tax) => tax.categories.includes(category))?.index ?? '') +
                '] ' +
                category +
                ' x ' +
                quantity +
                ' ⟹ ' +
                toCurrencyFn(amount)
        )
        .concat([''])
        .concat(['TAUX\t HT \t TVA \t TTC '])
        .concat(
            taxAmount
                .map(
                    (t) =>
                        'T' +
                        (isNaN(t.index) ? '' : t.index) +
                        ' ' +
                        t.rate +
                        '%' +
                        '\t' +
                        toCurrencyFn(t.ht) +
                        '\t' +
                        toCurrencyFn(t.tva) +
                        '\t' +
                        toCurrencyFn(t.total)
                )
                .concat([
                    'TOTAL' +
                        '\t' +
                        toCurrencyFn(totalTaxes.ht) +
                        '\t' +
                        toCurrencyFn(totalTaxes.tva) +
                        '\t' +
                        toCurrencyFn(totalTaxes.total),
                ])
        )
        .concat([''])
        .concat(
            payments.map(({ category, quantity, amount }) => category + ' x ' + quantity + ' ⟹ ' + toCurrencyFn(amount))
        );

    const period = transactions.length
        ? new Date(agg.firstTransactionDate).toLocaleDateString('fr-FR') +
          ' au ' +
          new Date(agg.lastTransactionDate).toLocaleDateString('fr-FR')
        : '';

    return {
        shop,
        period,
        amount: '',
        ...agg,
        currency,
        summary,
        payments,
        provisionBreakdown,
        debitTotal,
        employerShareTotal,
        transactions,
        cancellations,
        refunds,
    };
}

export const useSummary = () => {
    const { currencies, currencyIndex, inventory, parameters, getPrinterAddressByRole, hasCashierPrinter } =
        useConfig();
    const {
        transactions,
        toCurrency,
        transactionsFilename,
        isDbConnected,
        processTransactions,
        getAvailableDaysFromSQL,
        syncSpecificDayFromSQL,
    } = useData();
    const { openPopup, closePopup, updatePopup } = usePopup();

    const ImportOption = useMemo(
        () => (
            <label
                className={twMerge(
                    'w-full font-semibold text-xl py-2 pl-3 text-left hover:bg-active-light dark:hover:bg-active-dark cursor-pointer'
                )}
            >
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
        setHistoricalKeys(matching);
    }, [transactionsFilename]);

    const getFilteredTransactions = useCallback(() => {
        const t = tempTransactions.current.length ? tempTransactions.current : transactions.length ? transactions : [];
        const currency = currencies[currencyIndex];
        // Match the current currency tolerantly: legacy/migrated transactions store the
        // currency as "Label (Symbol)" (e.g. "Euro (€)") while new ones store just the label.
        const matchesCurrency = (txCurrency: string) =>
            txCurrency === currency.label ||
            txCurrency === currency.symbol ||
            txCurrency === `${currency.label} (${currency.symbol})`;
        return t.filter(
            (transaction) =>
                matchesCurrency(transaction.currency) &&
                !isDeletedTransaction(transaction) &&
                !isCancelledTransaction(transaction) &&
                !isWaitingTransaction(transaction) &&
                !isProcessingTransaction(transaction)
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
        const provisionMap = new Map<string, number>();
        let debitTotal = 0;
        let employerShareTotal = 0;

        transactions.forEach((transaction) => {
            const isRefund = isRefundTransaction(transaction);
            // Include provision transactions in payments (they have no products but still have a payment method)
            const payment = payments.find((payment) => payment.category === transaction.method);
            if (payment) {
                payment.quantity += isRefund ? -1 : 1;
                payment.amount += transaction.amount;
            } else {
                payments.unshift({
                    category: transaction.method,
                    quantity: isRefund ? -1 : 1,
                    amount: transaction.amount,
                });
            }

            // Track DEBIT payments (Crédits Clients Accordés)
            if (transaction.method?.toUpperCase() === DEBIT_KEYWORD) {
                debitTotal += transaction.amount;
            }

            // Track employer share (Hors CA)
            if (transaction.employerShare && transaction.employerShare !== 0) {
                employerShareTotal += transaction.employerShare;
            }

            // Per-customer provision breakdown (transactions with no products)
            if (transaction.products.length === 0 && transaction.customerName) {
                const key = transaction.method + '\t' + transaction.customerName;
                const existing = provisionMap.get(key);
                if (existing !== undefined) {
                    provisionMap.set(key, existing + transaction.amount);
                } else {
                    provisionMap.set(key, transaction.amount);
                }
            }

            // Only process products for non-provision transactions
            if (transaction.products.length) {
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
            }
        });

        const provisionBreakdown: ProvisionBreakdownEntry[] = [];
        for (const [key, amount] of provisionMap) {
            const [method, customerName] = key.split('\t');
            provisionBreakdown.push({ method, customerName, amount });
        }
        provisionBreakdown.sort(
            (a, b) => a.method.localeCompare(b.method) || a.customerName.localeCompare(b.customerName)
        );

        return { categories, payments, provisionBreakdown, debitTotal, employerShareTotal };
    }, []);

    const getTransactionsData = useCallback(
        (transactions: Transaction[]) => {
            if (!transactions.length)
                return {
                    categories: [],
                    payments: [],
                    summary: [],
                    provisionBreakdown: [],
                    debitTotal: 0,
                    employerShareTotal: 0,
                };

            const { categories, payments, provisionBreakdown, debitTotal, employerShareTotal } =
                getTransactionsDetails(transactions);
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
                provisionBreakdown,
                debitTotal,
                employerShareTotal,
                summary: categories
                    .map(
                        ({ category, quantity, amount }) =>
                            '[T' +
                            (taxes.find((tax) => tax.categories.includes(category))?.index ?? '') +
                            '] ' +
                            category +
                            ' x ' +
                            quantity +
                            ' ⟹ ' +
                            toCurrency(amount)
                    )
                    .concat([''])
                    .concat(['TAUX\t HT \t TVA \t TTC '])
                    .concat(
                        taxAmount
                            .map((t) => {
                                return t
                                    ? 'T' +
                                          (isNaN(t.index) ? '' : t.index) +
                                          ' ' +
                                          t.rate +
                                          '%' +
                                          '\t' +
                                          toCurrency(t.ht) +
                                          '\t' +
                                          toCurrency(t.tva) +
                                          '\t' +
                                          toCurrency(t.total)
                                    : '';
                            })
                            .concat([
                                'TOTAL' +
                                    '\t' +
                                    toCurrency(totalTaxes.ht) +
                                    '\t' +
                                    toCurrency(totalTaxes.tva) +
                                    '\t' +
                                    toCurrency(totalTaxes.total),
                            ])
                    )
                    .concat([''])
                    .concat(
                        payments.map(
                            ({ category, quantity, amount }) => category + ' x ' + quantity + ' ⟹ ' + toCurrency(amount)
                        ) ?? []
                    ),
            };
        },
        [getTaxAmountByCategory, getTaxesByCategory, getTransactionsDetails, toCurrency]
    );

    const showSyncMenu = useCallback(
        (backCallback = closePopup) => {
            const clearLocalData = () => {
                const prefix = transactionsFilename?.split('_')[0] ?? '';
                const keysToDelete: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.split('_')[0] === prefix) {
                        keysToDelete.push(key);
                    }
                }
                keysToDelete.forEach((key) => localStorage.removeItem(key));
                indexedDB.deleteDatabase('TradizTransactions');
                refreshHistoricalKeys();
            };

            const runSync = (action: SyncAction) => {
                const isExport = action === SyncAction.export;
                openPopup('Synchronisation', [isExport ? 'Export en cours...' : 'Synchronisation 0%'], () => {}, true);
                processTransactions(action, undefined, undefined, (percent) => {
                    if (!isExport) updatePopup('Synchronisation', [`Synchronisation ${percent}%`]);
                }).then((count) => {
                    refreshHistoricalKeys();
                    if (isExport) {
                        openPopup('Synchronisation', ['Fichier exporté']);
                    } else {
                        openPopup('Synchronisation', [
                            count > 0 ? `${count} transaction(s) synchronisée(s)` : 'Aucune transaction à synchroniser',
                        ]);
                    }
                });
            };

            if (isDbConnected) {
                // Check if there's data to migrate in localStorage
                openPopup(
                    'Synchronisation',
                    ['Synchronisation complète', 'Synchronisation jour', ImportOption]
                        .concat(getHistoricalTransactions().length ? ['Exporter'] : [])
                        .concat(['Stockage', 'Supprimer données locales'])
                        .concat(['', BACK_KEYWORD]),
                    (_, option) => {
                        // Handle back button
                        if (option === BACK_KEYWORD) {
                            backCallback();
                            return;
                        }

                        const action = {
                            'Synchronisation complète': SyncAction.fullsync,
                            'Synchronisation jour': SyncAction.daysync,
                            Exporter: SyncAction.export,
                        }[option];
                        if (action === SyncAction.daysync) {
                            // Show day selection popup
                            getAvailableDaysFromSQL().then((days) => {
                                if (!days.length) {
                                    openPopup('Synchronisation', ['Aucun jour disponible dans la base de données']);
                                    return;
                                }

                                // Group days by month
                                const daysByMonth: Record<string, string[]> = {};
                                days.forEach((day) => {
                                    const month = day.substring(0, 7); // YYYY-MM
                                    if (!daysByMonth[month]) {
                                        daysByMonth[month] = [];
                                    }
                                    daysByMonth[month].push(day);
                                });

                                // Sort months in descending order
                                const sortedMonths = Object.keys(daysByMonth).sort().reverse();

                                // Show month selection popup with arrows
                                const monthEntries = sortedMonths.map((month) => {
                                    const date = new Date(month + '-01');
                                    return `${date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}${ARROW}`;
                                });
                                monthEntries.push('', BACK_KEYWORD);

                                // Function to show month selection popup (reusable for back button)
                                const showMonthSelection = (backCallback = closePopup) => {
                                    openPopup('Synchronisation jour', monthEntries, (index) => {
                                        if (index < 0) {
                                            backCallback();
                                            return;
                                        }
                                        if (index >= sortedMonths.length) {
                                            // Back button - return to sync menu
                                            showSyncMenu(backCallback);
                                            return;
                                        }

                                        const selectedMonth = sortedMonths[index];
                                        const daysInMonth = daysByMonth[selectedMonth];

                                        // Show day selection popup
                                        const dayEntries = daysInMonth.map((day) => {
                                            const date = new Date(day);
                                            return date.toLocaleDateString(undefined, {
                                                weekday: 'short',
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                            });
                                        });
                                        dayEntries.push('', BACK_KEYWORD);

                                        openPopup(
                                            `${new Date(selectedMonth + '-01').toLocaleDateString(undefined, {
                                                month: 'long',
                                                year: 'numeric',
                                            })}`,
                                            dayEntries,
                                            (dayIndex, _dayOption) => {
                                                if (dayIndex < 0) {
                                                    backCallback();
                                                    return;
                                                }
                                                if (dayIndex >= daysInMonth.length) {
                                                    // Back button - return to month list
                                                    showMonthSelection(backCallback);
                                                    return;
                                                }

                                                const selectedDay = daysInMonth[dayIndex];
                                                openPopup(
                                                    'Synchronisation',
                                                    ['Synchronisation en cours...'],
                                                    () => {},
                                                    true
                                                );

                                                (async () => {
                                                    const count = await syncSpecificDayFromSQL(selectedDay);
                                                    refreshHistoricalKeys();
                                                    openPopup('Synchronisation', [
                                                        count > 0
                                                            ? `${count} transaction(s) synchronisée(s)`
                                                            : 'Aucune transaction trouvée pour ce jour',
                                                    ]);
                                                })();
                                            }
                                        );
                                    });
                                };

                                showMonthSelection(backCallback);
                            });
                        } else if (action === SyncAction.fullsync) {
                            openPopup(
                                '⚠️ Attention - Suppression des données',
                                [
                                    'La synchronisation complète va supprimer les données locales avant de télécharger.',
                                    'Confirmer la suppression',
                                    'Annuler',
                                ],
                                (_, confirmOption) => {
                                    if (confirmOption === 'Confirmer la suppression') {
                                        clearLocalData();
                                        runSync(SyncAction.fullsync);
                                    } else {
                                        showSyncMenu();
                                    }
                                }
                            );
                        } else if (action) {
                            runSync(action);
                        } else if (option === 'Stockage') {
                            getStorageUsage().then((usage) => {
                                openPopup(
                                    'Stockage',
                                    [
                                        `Utilisé : ${usage.usedFormatted}`,
                                        `Disponible : ${usage.quotaFormatted}`,
                                        `Utilisation : ${usage.percentUsed}%`,
                                        '',
                                        BACK_KEYWORD,
                                    ],
                                    (index) => {
                                        // Only handle back button click (index 4) and close button (index -1), ignore storage info items
                                        if (index < 0) closePopup();
                                        if (index === 4) showSyncMenu();
                                    },
                                    true
                                );
                            });
                        } else if (option === 'Supprimer données locales') {
                            openPopup(
                                '⚠️ Attention - Suppression des données',
                                ['Confirmer la suppression', 'Annuler'],
                                (_, confirmOption) => {
                                    if (confirmOption === 'Confirmer la suppression') {
                                        clearLocalData();
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
            updatePopup,
            getAvailableDaysFromSQL,
            syncSpecificDayFromSQL,
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
                            closePopup();
                            return;
                        }
                        if (index >= months.length) {
                            // Back button
                            closePopup();
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

                            // Filter out days with only deleted transactions
                            (async () => {
                                const shopIdPrefix = transactionsFilename.split('_')[0];
                                const validDays: string[] = [];
                                for (const dayKey of daysInMonth) {
                                    const key = `${shopIdPrefix}_${dayKey}`;
                                    const txs = await idbGetTransactions(key);
                                    // Only include days with at least one non-deleted, non-cancelled transaction
                                    if (!txs.every((t) => isDeletedTransaction(t) || isCancelledTransaction(t))) {
                                        validDays.push(dayKey);
                                    }
                                }

                                if (!validDays.length) {
                                    // No valid days - go back to month selection
                                    showHistoricalTransactions(
                                        HistoricalPeriod.month,
                                        menu,
                                        showTransactionsCallback,
                                        fallback
                                    );
                                    return;
                                }

                                const dayEntries = validDays.map((dayKey) => {
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
                                        if (dayIndex >= validDays.length) {
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
                                            const key = transactionsFilename.split('_')[0] + '_' + validDays[dayIndex];
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
                            })();
                        }
                    },
                    true
                );
                return;
            }

            // For month period, group by year
            if (isMonthPeriod) {
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
                ({ label, quantity, amount }) => label + ' x ' + quantity + ' ⟹ ' + toCurrency(amount)
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
                    const label = products.length
                        ? `${products.length} produit${products.length > 1 ? 's' : ''}`
                        : 'Provision';
                    return label + ' ⟹ ' + toCurrency(amount) + ' le ' + frenchDateStr + ' à ' + frenchTimeStr;
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
            const agg = buildSummaryAggregates(filteredTransactions);
            const totalProducts = categories.reduce((total, category) => total + category.quantity, 0) ?? 0;
            const { totalAmount, transactionCount } = agg;

            openPopup(
                `${totalProducts} produit${totalProducts > 1 ? 's' : ''} | ${transactionCount} vente${
                    transactionCount > 1 ? 's' : ''
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
        if (!filteredTransactions.length) return false;

        const { summary, payments, provisionBreakdown, debitTotal, employerShareTotal } =
            getTransactionsData(filteredTransactions);
        const period = getPeriodDescription(filteredTransactions);
        const amount = toCurrency(payments.reduce((total, payment) => total + payment.amount, 0));

        const agg = buildSummaryAggregates(filteredTransactions);

        return await sendSummaryEmail({
            shop: parameters.shop,
            period,
            amount,
            ...agg,
            currency: currencies[currencyIndex],
            summary,
            payments,
            provisionBreakdown,
            debitTotal,
            employerShareTotal,
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

    const printTransactionsSummary = useCallback(async () => {
        const filteredTransactions = getFilteredTransactions();
        if (!filteredTransactions.length) return { error: 'Aucune transaction' };

        const resolved = await resolveCashierPrinter(getPrinterAddressByRole);
        if ('error' in resolved) return { error: resolved.error };
        const { addresses: printerAddresses, baud: comBaud } = resolved;
        if (!printerAddresses.length) return { error: 'Imprimante non trouvée' };

        // Get transaction summary data
        const { summary, payments, provisionBreakdown, debitTotal, employerShareTotal } =
            getTransactionsData(filteredTransactions);

        // Get period description
        const period = getPeriodDescription(filteredTransactions);

        const agg = buildSummaryAggregates(filteredTransactions);

        // Print the Ticket Z using server action
        return await printSummary(
            printerAddresses,
            {
                shop: parameters.shop,
                period,
                amount: '',
                ...agg,
                currency: currencies[currencyIndex],
                summary,
                payments,
                provisionBreakdown,
                debitTotal,
                employerShareTotal,
            },
            comBaud
        );
    }, [
        getFilteredTransactions,
        getPeriodDescription,
        getTransactionsData,
        parameters,
        getPrinterAddressByRole,
        currencies,
        currencyIndex,
    ]);

    const printTicketXSummary = useCallback(async () => {
        const filteredTransactions = getFilteredTransactions();
        if (!filteredTransactions.length) return { error: 'Aucune transaction' };

        const resolved = await resolveCashierPrinter(getPrinterAddressByRole);
        if ('error' in resolved) return { error: resolved.error };
        const { addresses: printerAddresses, baud: comBaud } = resolved;
        if (!printerAddresses.length) return { error: 'Imprimante non trouvée' };

        const { summary, payments, provisionBreakdown, debitTotal, employerShareTotal } =
            getTransactionsData(filteredTransactions);

        const period = getPeriodDescription(filteredTransactions);
        const agg = buildSummaryAggregates(filteredTransactions);

        // Extract cancellations and refunds from the raw transaction list
        const allTransactions = tempTransactions.current.length
            ? tempTransactions.current
            : transactions.length
              ? transactions
              : [];
        const cancellations = allTransactions.filter((tx) => isDeletedTransaction(tx) || isCancelledTransaction(tx));
        const refunds = filteredTransactions.filter((tx) => isRefundTransaction(tx));

        return await printTicketX(
            printerAddresses,
            {
                shop: parameters.shop,
                period,
                amount: '',
                ...agg,
                currency: currencies[currencyIndex],
                summary,
                payments,
                provisionBreakdown,
                debitTotal,
                employerShareTotal,
                transactions: filteredTransactions,
                cancellations,
                refunds,
            },
            comBaud
        );
    }, [
        getFilteredTransactions,
        getPeriodDescription,
        getTransactionsData,
        parameters,
        getPrinterAddressByRole,
        currencies,
        currencyIndex,
        transactions,
    ]);

    const showTransactionsSummaryMenu = useCallback(() => {
        const hasTransactions = transactions.length || tempTransactions.current.length;
        const historicalTransactions = getHistoricalTransactions();

        // If no transactions, nor historical transaction and DB connected, show sync menu directly
        if (!hasTransactions && !historicalTransactions.length && isDbConnected) {
            showSyncMenu();
            return;
        }

        if (hasTransactions || isDbConnected) {
            const transactionsDate = getTransactionsDate(getFilteredTransactions());
            const isDailyPeriod = transactionsDate.period === HistoricalPeriod.day;
            const formattedDate = getFormattedDate(transactionsDate.date, isDailyPeriod ? 3 : 2);

            // Ticket Z should only be printed on the cashier printer, not kitchen/bar.
            const ticketZPrinterNames = hasCashierPrinter() ? [PRINT_KEYWORD] : [];
            const ticketXPrinterNames = hasCashierPrinter() ? ['Ticket X'] : [];

            openPopup(
                'Ticket Z ' + (hasTransactions ? formattedDate : ''),
                (hasTransactions ? ['Email', 'Feuille de calcul'] : [])
                    .concat(hasTransactions ? ticketZPrinterNames : [])
                    .concat(hasTransactions ? ticketXPrinterNames : [])
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
                            printTransactionsSummary().then((response) => {
                                if (!response.success) openPopup('Erreur', [response.error || "Impossible d'imprimer"]);
                                else closePopup();
                            });
                            break;
                        case 'Ticket X':
                            openPopup('Ticket X', ['Impression en cours...']);
                            printTicketXSummary().then((response) => {
                                if (!response.success) openPopup('Erreur', [response.error || "Impossible d'imprimer"]);
                                else closePopup();
                            });
                            break;
                        case 'Email':
                            openPopup('Email', ['Envoi en cours...']);
                            processEmail()
                                .then((success) => {
                                    if (success) openPopup('Email', ['Email envoyé à ' + parameters.shop.email]);
                                    else openPopup('Erreur', ["Impossible d'envoyer l'email"]);
                                })
                                .catch(() => {
                                    openPopup('Erreur', ["Impossible d'envoyer l'email"]);
                                });
                            break;
                        case 'Feuille de calcul':
                            downloadData('TicketZ ' + formattedDate);
                            closePopup();
                            break;
                        case 'Menu Synchronisation':
                            showSyncMenu(showTransactionsSummaryMenu);
                            break;
                        case 'Resynchroniser jour': {
                            const todayDate = getFormattedDate(new Date(), 3);
                            openPopup('Synchronisation', ['Synchronisation en cours...'], () => {}, true);
                            (async () => {
                                const count = await syncSpecificDayFromSQL(todayDate);
                                refreshHistoricalKeys();
                                openPopup('Synchronisation', [
                                    count > 0
                                        ? `${count} transaction(s) synchronisée(s)`
                                        : 'Aucune transaction trouvée pour ce jour',
                                ]);
                            })();
                            break;
                        }
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
        printTicketXSummary,
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
        hasCashierPrinter,
        parameters,
        syncSpecificDayFromSQL,
        refreshHistoricalKeys,
    ]);

    return {
        showTransactionsSummary,
        showTransactionsSummaryMenu,
        getHistoricalTransactions,
        refreshHistoricalKeys,
    };
};
