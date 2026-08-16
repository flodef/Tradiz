'use client';

import { ChangeEvent, FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { DataContext } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { useWindowParam } from '../hooks/useWindowParam';
import {
    DELETED_KEYWORD,
    OTHER_KEYWORD,
    PROCESSING_KEYWORD,
    REFUND_KEYWORD,
    SYNC_INTERVAL_MS,
    TRANSACTIONS_KEYWORD,
    USE_DIGICARTE,
} from '../utils/constants';
import { getFormattedDate, getTransactionFileName, toSQLDateTime } from '../utils/date';
import {
    Company,
    Customer,
    Discount,
    OrderData,
    OrderItem,
    Product,
    ServiceType,
    SyncAction,
    SyncPeriod,
    Transaction,
    TransactionSet,
    serviceTypeToDb,
} from '../utils/interfaces';
import {
    idbGetAllTransactionSets,
    idbGetTransactions,
    idbRemoveTransactions,
    idbSetTransactions,
} from '../utils/transactionStore';
import { checkDbConfig, getPublicKey } from '../utils/processData';
import { encodeCashNote } from '../utils/transactionNote';
import { mergeTransactionArrays } from './dataProvider/syncUtils';
import {
    isDeletedTransaction,
    isProcessingTransaction,
    isRefundTransaction,
    isUpdatingTransaction,
    isWaitingTransaction,
} from './dataProvider/transactionHelpers';
import { useMercurial } from './dataProvider/useMercurial';
import { resolveSelectionAfterDelete } from './dataProvider/productHelpers';
import { useShopId } from '../hooks/useShopId';

enum DatabaseAction {
    add,
    update,
    delete,
    hardDelete,
}

export interface DataProviderProps {
    children: ReactNode;
}

/**
 * Floors a timestamp to second precision by removing milliseconds.
 * This matches the SQL TIMESTAMP precision which stores only seconds.
 * @param timestamp - The timestamp in milliseconds
 * @returns The timestamp floored to second precision
 */
export function floorToSeconds(timestamp: number): number {
    return Math.floor(timestamp / 1000) * 1000;
}

export function computeResetTimes(closingHour: number, now?: Date) {
    const currentTime = now ?? new Date();
    const reset = new Date(currentTime);
    reset.setHours(closingHour, 0, 0, 0);

    // Get the LAST occurrence of closing hour (in the past) - this is the cutoff for current day's transactions
    const lastReset = new Date(reset);
    if (currentTime < lastReset) lastReset.setDate(lastReset.getDate() - 1);

    // Compute NEXT reset timestamp (in the future) for scheduling the reset
    const nextReset = new Date(reset);
    if (currentTime >= nextReset) nextReset.setDate(nextReset.getDate() + 1);

    return {
        last: lastReset.getTime(),
        next: nextReset.getTime(),
    };
}

export const DataProvider: FC<DataProviderProps> = ({ children }) => {
    const { currencies, currencyIndex, setCurrency, parameters, isKitchenViewEnabled } = useConfig();
    const { isOnline } = useWindowParam();
    const { openFullscreenPopup } = usePopup();

    const [transactionsFilename, setTransactionsFilename] = useState('');
    const [total, setTotal] = useState(0);
    const [amount, setAmount] = useState(0);
    const [quantity, setQuantity] = useState(0);
    const [currentMercurial, setCurrentMercurial] = useState(parameters.mercurial);
    const [selectedProduct, setSelectedProduct] = useState<Product>();
    const products = useRef<Product[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const transactionId = useRef(0);
    const areTransactionLoaded = useRef(false);
    // Set to true by clearTotal to prevent the product-restore effect from re-adding
    // stale items from PROCESSING transactions when transactions load asynchronously.
    const clearRequestedRef = useRef(false);
    // Set to true by editTransaction when the edited tx was WAITING, so commitTransaction
    // knows the kitchen already received a ticket and should not print another one.
    const wasWaitingBeforeEditRef = useRef(false);
    // Snapshot of the original products when editing a WAITING tx, used to compute the delta
    // (added/removed products) for the kitchen ticket when the tx is put back in WAITING or paid.
    const originalProductsSnapshotRef = useRef<Product[]>([]);
    // Set to true by editTransaction to suppress auto-save during addProduct calls
    // (editTransaction already saves the PROCESSING tx via saveTransactions).
    const suppressAutoSaveRef = useRef(false);
    const syncInProgress = useRef(false);
    const lastServerSyncTime = useRef<string | undefined>(undefined);
    const [orderId, setOrderId] = useState('');
    const [shortNumOrder, setShortNumOrder] = useState('');
    const [orderData, setOrderData] = useState<OrderData | null>(null);
    const [selectedOrderItems, setSelectedOrderItems] = useState<OrderItem[]>([]);
    const [partialPaymentAmount, setPartialPaymentAmount] = useState(0);
    const [showPartialPaymentSelector, setShowPartialPaymentSelector] = useState(false);
    const [counterServiceType, setCounterServiceTypeState] = useState<ServiceType>('takeout');
    const [contextTableId, setContextTableId] = useState('');
    const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
    const [companies, setCompanies] = useState<Company[]>([]);
    const counterServiceTypeRef = useRef<ServiceType>('takeout');
    const setCounterServiceType = useCallback((type: ServiceType) => {
        counterServiceTypeRef.current = type;
        setCounterServiceTypeState(type);
    }, []);

    const [hasDbConfig, setHasDbConfig] = useState(false);
    const { shopId: resolvedShopId, isResolved: shopIdFetchDone } = useShopId();

    useEffect(() => {
        const checkDb = async () => {
            const hasConfig = await checkDbConfig();
            setHasDbConfig(hasConfig);
        };
        checkDb();
    }, []);

    const isDbConnected = useMemo(() => hasDbConfig && isOnline, [hasDbConfig, isOnline]);

    // Fetch companies for employer meal price calculation
    useEffect(() => {
        if (!isDbConnected) return;
        fetch('/api/sql/getCompanies')
            .then((res) => res.json())
            .then((data) => {
                if (data.companies) setCompanies(data.companies);
            })
            .catch((error) => console.error('Failed to fetch companies:', error));
    }, [isDbConnected]);

    // Compute employer share: if the current customer belongs to a company with
    // a meal price > 0, the employer pays part of the meal (capped at the total).
    const employerShare = useMemo(() => {
        if (!currentCustomer?.company) return 0;
        const company = companies.find((c) => c.name === currentCustomer.company);
        if (!company || !company.mealPrice || company.mealPrice <= 0) return 0;
        return company.mealPrice;
    }, [currentCustomer?.company, companies]);

    useEffect(() => {
        setCurrentMercurial(parameters.mercurial);
    }, [parameters.mercurial]);

    const loadTransactionsFromSQL = useCallback(async (date?: Date) => {
        try {
            const dateStr = (date || new Date()).toISOString().split('T')[0];
            const response = await fetch(`/api/sql/getTransactions?date=${dateStr}&period=day`);
            if (!response.ok) {
                const error = await response.json();
                console.error('SQL DB read error:', error);
                return null;
            }
            const data = await response.json();
            return data.transactions as Transaction[];
        } catch (error) {
            console.error('Error loading transactions from SQL DB:', error);
            return null;
        }
    }, []);

    const getLocalTransactions = useCallback(async () => {
        return idbGetAllTransactionSets(resolvedShopId || TRANSACTIONS_KEYWORD);
    }, [resolvedShopId]);

    const setLocalStorageItem = useCallback(async (key: string, transactions: Transaction[]) => {
        await idbSetTransactions(key, transactions);
    }, []);

    // Compute both last and next reset timestamps
    const getResetTimes = useCallback(() => {
        return computeResetTimes(parameters.closingHour);
    }, [parameters.closingHour]);

    useEffect(() => {
        if (!parameters.shop.name || areTransactionLoaded.current) return;

        // Validate shop ID when using SQL database
        if (!resolvedShopId) {
            if (!shopIdFetchDone) return; // still fetching, wait
            console.error('[DataProvider] ERROR: shop.id is required when USE_DIGICARTE is enabled');
            openFullscreenPopup(
                'Configuration Error: Shop ID is missing. Please configure the shop ID in the database parameters.',
                ['OK']
            );
            return;
        }

        const filename = getTransactionFileName(resolvedShopId);

        const loadTransactions = async () => {
            // Auto-migrate ALL transaction keys from localStorage to IndexedDB
            const keysToMigrate: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.split('_')[0] === resolvedShopId) {
                    keysToMigrate.push(key);
                }
            }

            if (keysToMigrate.length > 0) {
                for (const key of keysToMigrate) {
                    const raw = localStorage.getItem(key);
                    if (!raw) continue;
                    try {
                        const transactions = JSON.parse(raw) as Transaction[];
                        const existing = await idbGetTransactions(key);
                        if (existing.length) {
                            // Merge: keep unique by createdDate, prefer newer modifiedDate
                            const merged = [...existing];
                            for (const tx of transactions) {
                                const idx = merged.findIndex((m) => m.createdDate === tx.createdDate);
                                if (idx === -1) {
                                    merged.push(tx);
                                } else if (tx.modifiedDate > merged[idx].modifiedDate) {
                                    merged[idx] = tx;
                                }
                            }
                            await idbSetTransactions(key, merged);
                        } else {
                            await idbSetTransactions(key, transactions);
                        }
                        localStorage.removeItem(key);
                    } catch (e) {
                        console.error(`[Migration] Failed to migrate ${key}:`, e);
                    }
                }
            }

            // Load from IndexedDB
            const localTransactions = await idbGetTransactions(filename);

            // If SQL DB is enabled (MariaDB or PostgreSQL), merge SQL data into local (latest modifiedDate wins)
            if (USE_DIGICARTE || (await checkDbConfig())) {
                const sqlTransactions = await loadTransactionsFromSQL();
                if (sqlTransactions?.length) {
                    const merged = mergeTransactionArrays(localTransactions, sqlTransactions);

                    // Filter transactions: only keep those after the last reset time
                    const { last: lastResetTime } = getResetTimes();
                    const currentDayTransactions = merged.filter((tx) => tx.createdDate >= lastResetTime);
                    const oldTransactions = merged.filter((tx) => tx.createdDate < lastResetTime);

                    // Store old transactions in IndexedDB for historical access
                    if (oldTransactions.length > 0) {
                        // Group old transactions by day and store them
                        const groupedByDay = new Map<string, Transaction[]>();
                        oldTransactions.forEach((tx) => {
                            const date = new Date(tx.createdDate);
                            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                            const key = `${resolvedShopId}_${dateKey}`;
                            if (!groupedByDay.has(key)) groupedByDay.set(key, []);
                            groupedByDay.get(key)!.push(tx);
                        });

                        // Save each day's transactions to IndexedDB
                        for (const key of Array.from(groupedByDay.keys())) {
                            const txs = groupedByDay.get(key)!;
                            const existing = await idbGetTransactions(key);
                            const mergedOld = mergeTransactionArrays(existing, txs);
                            await idbSetTransactions(key, mergedOld);
                        }

                        // Save each day's transactions to IndexedDB
                    }

                    // Only show current day's transactions
                    setLocalStorageItem(filename, currentDayTransactions);
                    setTransactions(currentDayTransactions);
                    areTransactionLoaded.current = true;
                    setTransactionsFilename(filename);
                    return;
                }
            }

            // Filter local transactions by last reset time
            const { last: lastResetTime } = getResetTimes();
            const currentDayTransactions = localTransactions.filter((tx) => tx.createdDate >= lastResetTime);
            setTransactions(currentDayTransactions);
            areTransactionLoaded.current = true;
            setTransactionsFilename(filename);
        };

        loadTransactions();
    }, [
        parameters.shop.name,
        transactionsFilename,
        loadTransactionsFromSQL,
        setLocalStorageItem,
        getResetTimes,
        openFullscreenPopup,
        resolvedShopId,
        shopIdFetchDone,
    ]);

    const performDayReset = useCallback(() => {
        areTransactionLoaded.current = false;
        setTransactionsFilename('');
        nextResetTime.current = getResetTimes().next;
    }, [getResetTimes]);

    // Check if reset should happen and perform it
    const checkAndPerformDayReset = useCallback(() => {
        if (Date.now() >= nextResetTime.current && areTransactionLoaded.current) {
            performDayReset();
            return true;
        }
        return false;
    }, [performDayReset]);

    const nextResetTime = useRef(0);

    // Day reset: setTimeout (primary) + setInterval + visibilitychange (backups)
    useEffect(() => {
        if (!parameters.shop.name) return;

        nextResetTime.current = getResetTimes().next;

        // Primary: setTimeout to the next reset time
        const msUntilReset = nextResetTime.current - Date.now();
        const timeout = setTimeout(performDayReset, msUntilReset);

        // Backup: check every 60s if we've passed the reset time
        const interval = setInterval(() => {
            if (Date.now() >= nextResetTime.current) performDayReset();
        }, 60_000);

        // Backup: check on tab focus (handles device sleep / backgrounded tabs)
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible' && Date.now() >= nextResetTime.current) {
                performDayReset();
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            clearTimeout(timeout);
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [parameters.shop.name, getResetTimes, performDayReset]);

    const storeTransaction = useCallback(
        (transaction: Transaction) => {
            setTransactions((previous) => {
                const next = [...previous];
                const index = next.findIndex(({ createdDate }) => createdDate === transaction.createdDate);

                if (index >= 0) {
                    next.splice(index, 1, transaction);
                } else {
                    next.unshift(transaction);
                }

                return next;
            });
        },
        [setTransactions]
    );

    const updateLocalTransaction = useCallback(
        (transactionSet: TransactionSet) => {
            const txToUpdate = transactionSet.transactions;
            // Always persist to IndexedDB (including deleted-flagged and processing transactions)
            setLocalStorageItem(transactionSet.id, txToUpdate);

            // Update React state if this is the current day's transaction set
            if (transactionSet.id === transactionsFilename) {
                const { last: lastResetTime } = getResetTimes();
                const currentDayTransactions = txToUpdate.filter((tx) => tx.createdDate >= lastResetTime);
                setTransactions(currentDayTransactions);
            }
        },
        [setLocalStorageItem, transactionsFilename, getResetTimes]
    );

    // Check if the "transaction set" in the cloud exists in local (check by "id").
    // If not add it, if yes, check if every transaction in the cloud transaction set exist in local (check by "createdDate").
    // If not, add the transaction, if yes, check which one has the biggest "modifiedDate".
    // If it's the cloud one, update the local, if it's the local one, update the cloud.
    // Then, check if the "transaction set" in local exists in the cloud, using the same method as above.
    const fullSync = useCallback(
        async (cloudTransactionSets: TransactionSet[], _syncPeriod: SyncPeriod): Promise<number> => {
            const localTransactionSets = await getLocalTransactions();
            let syncedCount = 0;

            // Merge cloud → local
            for (const cloudTransactionSet of cloudTransactionSets) {
                const localTransactionSet = localTransactionSets.find((set) => set.id === cloudTransactionSet.id);

                if (!localTransactionSet) {
                    updateLocalTransaction(cloudTransactionSet);
                    syncedCount += cloudTransactionSet.transactions.length;
                } else {
                    const updateTransactionSet: TransactionSet = {
                        id: localTransactionSet.id,
                        transactions: [...localTransactionSet.transactions],
                    };
                    for (const cloudTransaction of cloudTransactionSet.transactions) {
                        const cloudTs = floorToSeconds(cloudTransaction.createdDate);
                        const index = localTransactionSet.transactions.findIndex(
                            (localTransaction) => floorToSeconds(localTransaction.createdDate) === cloudTs
                        );

                        if (index === -1) {
                            updateTransactionSet.transactions.push(cloudTransaction);
                            syncedCount++;
                        } else if (localTransactionSet.id === transactionsFilename) {
                            const localTransaction = localTransactionSet.transactions[index];

                            if (cloudTransaction.modifiedDate > localTransaction.modifiedDate) {
                                updateTransactionSet.transactions.splice(index, 1, cloudTransaction);
                                syncedCount++;
                            } else if (cloudTransaction.modifiedDate < localTransaction.modifiedDate) {
                                // Local is newer — no cloud to update
                            } else if (cloudTransaction.shortNumOrder && !localTransaction.shortNumOrder) {
                                // Always propagate shortNumOrder from cloud even if no other changes
                                updateTransactionSet.transactions.splice(index, 1, {
                                    ...localTransaction,
                                    shortNumOrder: cloudTransaction.shortNumOrder,
                                });
                                syncedCount++;
                            }
                        }
                    }
                    updateLocalTransaction(updateTransactionSet);
                }
            }

            return syncedCount;
        },
        [getLocalTransactions, transactionsFilename, updateLocalTransaction]
    );

    const pushTransactionToSQL = useCallback(async (transaction: Transaction, action: 'add' | 'sync' = 'add') => {
        try {
            const response = await fetch('/api/sql/saveTransaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    transaction: {
                        id: transaction.createdDate,
                        order_id: String(transaction.createdDate),
                        user_name: transaction.validator,
                        payment_method: transaction.method,
                        amount: transaction.amount,
                        currency: transaction.currency,
                        change: encodeCashNote(transaction.cashAmount, transaction.change),
                        takeOut: transaction.takeOut ?? false,
                        created_at: toSQLDateTime(transaction.createdDate),
                        updated_at: toSQLDateTime(transaction.modifiedDate || transaction.createdDate),
                        products: transaction.products.map((product) => ({
                            label: product.label,
                            category: product.category,
                            amount: product.amount,
                            quantity: product.quantity,
                            discount_amount: product.discount.amount,
                            discount_unit: product.discount.unit,
                            total: product.total || 0,
                        })),
                    },
                }),
            });
            if (!response.ok) {
                console.error('Failed to push transaction to SQL:', await response.json());
            }
        } catch (error) {
            console.error('Error pushing transaction to SQL:', error);
        }
    }, []);

    const processSyncFromSQL = useCallback(
        async (syncPeriod: SyncPeriod, onProgress?: (percent: number) => void): Promise<number> => {
            try {
                onProgress?.(5);

                // Include deleted transactions so deletions propagate across devices
                const sqlTransactions: Transaction[] = [];
                let latestServerNow: string | undefined;
                if (syncPeriod === SyncPeriod.day) {
                    const today = new Date().toISOString().split('T')[0];
                    const urlParams = new URLSearchParams({
                        period: 'day',
                        date: today,
                        includeDeleted: 'true',
                    });
                    if (lastServerSyncTime.current) {
                        // Overlap by 5s to be tolerant of clock skew / second precision.
                        const sinceMs = new Date(lastServerSyncTime.current).getTime() - 5000;
                        urlParams.append('since', new Date(sinceMs).toISOString());
                    }
                    const response = await fetch(`/api/sql/getTransactions?${urlParams.toString()}`);
                    if (!response.ok) {
                        console.error('SQL DB sync error:', await response.json());
                        return 0;
                    }
                    const data = await response.json();
                    sqlTransactions.push(...(data.transactions as Transaction[]));
                    if (data.serverNow) latestServerNow = data.serverNow as string;
                    onProgress?.(30);
                } else {
                    // Full sync: fetch in batches to avoid timeouts / oversized responses
                    const BATCH_SIZE = 1000;
                    let batchOffset = 0;
                    let hasMore = true;
                    while (hasMore) {
                        const response = await fetch(
                            `/api/sql/getTransactions?period=full&includeDeleted=true&limit=${BATCH_SIZE}&offset=${batchOffset}`
                        );
                        if (!response.ok) {
                            console.error('SQL DB sync error:', await response.json());
                            return 0;
                        }
                        const data = await response.json();
                        const batch = data.transactions as Transaction[];
                        sqlTransactions.push(...batch);
                        if (data.serverNow) latestServerNow = data.serverNow as string;
                        hasMore = Boolean(data.hasMore);
                        batchOffset += BATCH_SIZE;
                        // Progress 5% → 40% during fetch (cap so it keeps moving)
                        onProgress?.(Math.min(40, 5 + Math.floor(sqlTransactions.length / 500)));
                    }
                }

                // Merge any server-side changes into local storage. When the server returned
                // nothing we still fall through to the local→SQL push below, so that local
                // transactions whose earlier immediate push failed get retried.
                let syncedCount = 0;
                if (sqlTransactions.length) {
                    // Group SQL transactions by their creation date
                    const groupedByDate = new Map<string, Transaction[]>();
                    sqlTransactions.forEach((tx) => {
                        const date = new Date(tx.createdDate);
                        const dateKey = getTransactionFileName(resolvedShopId, date);
                        if (!groupedByDate.has(dateKey)) groupedByDate.set(dateKey, []);
                        groupedByDate.get(dateKey)!.push(tx);
                    });

                    // Sync each day's transactions separately
                    const dateKeys = Array.from(groupedByDate.keys());
                    const totalDays = dateKeys.length;
                    let syncedDays = 0;

                    for (const dateKey of dateKeys) {
                        const dayTransactions = groupedByDate.get(dateKey)!;
                        const cloudTransactionSets: TransactionSet[] = [
                            {
                                id: dateKey,
                                transactions: dayTransactions,
                            },
                        ];
                        syncedCount += await fullSync(cloudTransactionSets, syncPeriod);
                        syncedDays++;
                        // Progress from 40% to 70% based on days synced
                        onProgress?.(40 + Math.floor((syncedDays / totalDays) * 30));
                    }
                }

                // Local→SQL push: only push local transactions that changed since the last
                // successful server sync. Because we fetch incrementally, sqlTransactions may
                // not contain unchanged rows, so we use the timestamp instead of presence in the
                // fetched list to decide what needs uploading.
                onProgress?.(70);
                const localTransactions = await idbGetTransactions(transactionsFilename);
                let pushedCount = 0;
                const lastSyncMs = latestServerNow ? new Date(latestServerNow).getTime() : 0;
                const pushSinceMs = lastSyncMs ? lastSyncMs - 5000 : 0;
                const changedLocal = localTransactions.filter(
                    (tx) => (tx.modifiedDate || tx.createdDate) > pushSinceMs
                );
                if (changedLocal.length) {
                    const totalLocal = changedLocal.length;
                    let processedLocal = 0;
                    for (const localTx of changedLocal) {
                        processedLocal++;
                        const localTs = floorToSeconds(localTx.createdDate);
                        const sqlTx = sqlTransactions.find(
                            (s) => s.createdDate === localTs || s.createdDate === localTx.createdDate
                        );
                        if (!sqlTx) {
                            // Not seen in the incremental window → safe to push (server version is older).
                            await pushTransactionToSQL(localTx, 'add');
                            pushedCount++;
                        } else if (localTx.modifiedDate > sqlTx.modifiedDate) {
                            // Local is newer than the version returned by the server.
                            await pushTransactionToSQL(localTx, 'sync');
                            pushedCount++;
                        }
                        // Progress from 70% to 90% based on local transactions processed
                        onProgress?.(70 + Math.floor((processedLocal / totalLocal) * 20));
                    }
                }

                if (latestServerNow) lastServerSyncTime.current = latestServerNow;
                onProgress?.(100);
                return syncedCount + pushedCount;
            } catch (error) {
                console.error('Error syncing from SQL DB:', error);
                return 0;
            }
        },
        [fullSync, transactionsFilename, pushTransactionToSQL, resolvedShopId]
    );

    const syncTransactions = useCallback(
        async (
            period: SyncPeriod,
            filename = transactionsFilename,
            onProgress?: (percent: number) => void
        ): Promise<number> => {
            if (!filename) return 0;
            return await processSyncFromSQL(period, onProgress);
        },
        [transactionsFilename, processSyncFromSQL]
    );

    const syncNow = useCallback(async () => {
        if (syncInProgress.current) return;
        if (!isOnline || !transactionsFilename || !resolvedShopId) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

        const hasDbConfig = await checkDbConfig();
        if (!hasDbConfig && !USE_DIGICARTE) return;

        syncInProgress.current = true;
        try {
            await syncTransactions(SyncPeriod.day);
        } catch (error) {
            console.error('Real-time sync failed:', error);
        } finally {
            syncInProgress.current = false;
        }
    }, [isOnline, transactionsFilename, syncTransactions, resolvedShopId]);

    useEffect(() => {
        if (!transactionsFilename || !resolvedShopId) return;

        const shouldRunSync = async () => {
            if (syncInProgress.current) return;
            try {
                const publicKey = getPublicKey();
                const heartbeat = await fetch('/api/sql/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ publicKey }),
                });
                if (!heartbeat.ok) return;
                // Always sync — even when no other devices are detected.
                // Devices may not be registered in the DB, or the heartbeat may
                // fail to detect them, but transactions still need to propagate.
                // The sync is incremental (only fetches changes since last sync)
                // so the overhead is minimal when there are no changes.
                await syncNow();
            } catch (error) {
                console.error('Presence heartbeat failed:', error);
            }
        };

        // Initial sync, then heartbeat-only polling.
        syncNow();
        const interval = setInterval(shouldRunSync, SYNC_INTERVAL_MS);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') shouldRunSync();
        };
        const handleOnline = () => shouldRunSync();

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('online', handleOnline);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', handleOnline);
        };
    }, [transactionsFilename, syncNow, resolvedShopId]);

    const exportTransactions = useCallback(async () => {
        const localTransactionSets = await getLocalTransactions();
        const jsonData = JSON.stringify(localTransactionSets);

        // Create a Blob and URL object containing the JSON data
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Create a link element to trigger the download
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Sauvegarde_' + getFormattedDate() + '.json';

        // Append the link element to the document and trigger the download
        document.body.appendChild(link);
        link.click();

        // Clean up the URL and link element
        URL.revokeObjectURL(url);
        document.body.removeChild(link);
    }, [getLocalTransactions]);

    const importTransactions = useCallback(
        (event?: ChangeEvent<HTMLInputElement>) => {
            const file = event?.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();

            reader.onload = (event) => {
                const jsonData = event.target?.result;
                if (typeof jsonData === 'string') {
                    const data = JSON.parse(jsonData);

                    // Store the data in the localStorage
                    data.forEach((item: { id: string; transactions: Transaction[] }) => {
                        setLocalStorageItem(item.id, item.transactions);
                    });
                }
            };
            reader.onerror = (error) => {
                alert(error);
            };

            reader.readAsText(file);
        },
        [setLocalStorageItem]
    );

    const processTransactions = useCallback(
        async (
            syncAction: SyncAction,
            date?: Date,
            event?: ChangeEvent<HTMLInputElement>,
            onProgress?: (percent: number) => void
        ): Promise<number> => {
            const filename = date ? getTransactionFileName(resolvedShopId, date) : transactionsFilename;
            switch (syncAction) {
                case SyncAction.fullsync:
                    return await syncTransactions(SyncPeriod.full, undefined, onProgress);
                case SyncAction.daysync:
                    return await syncTransactions(SyncPeriod.day, filename, onProgress);
                case SyncAction.export:
                    onProgress?.(50);
                    await exportTransactions();
                    onProgress?.(100);
                    return 0;
                case SyncAction.import:
                    importTransactions(event);
                    return 0;
            }
            return 0;
        },
        [syncTransactions, exportTransactions, importTransactions, transactionsFilename, resolvedShopId]
    );

    const getAvailableDaysFromSQL = useCallback(async (): Promise<string[]> => {
        try {
            const response = await fetch('/api/sql/getAvailableDates');
            if (!response.ok) {
                const error = await response.json();
                console.error('SQL DB available dates error:', error);
                return [];
            }
            const data = await response.json();
            return data.dates as string[];
        } catch (error) {
            console.error('Error fetching available days from SQL DB:', error);
            return [];
        }
    }, []);

    const syncSpecificDayFromSQL = useCallback(
        async (date: string): Promise<number> => {
            if (!resolvedShopId) return 0;
            const filename = `${resolvedShopId}_${date}`;

            try {
                // Delete from IndexedDB
                await idbRemoveTransactions(filename);

                // Fetch from SQL
                const response = await fetch(`/api/sql/getTransactions?date=${date}&period=day`);
                if (!response.ok) {
                    const error = await response.json();
                    console.error('SQL DB sync error:', error);
                    return 0;
                }
                const data = await response.json();
                const transactions = data.transactions as Transaction[];

                // Store in IndexedDB
                if (transactions.length) {
                    await idbSetTransactions(filename, transactions);
                }

                return transactions.length;
            } catch (error) {
                console.error('Error syncing specific day from SQL:', error);
                return 0;
            }
        },
        [resolvedShopId]
    );

    const saveTransactions = useCallback(
        async (action: DatabaseAction, transaction: Transaction) => {
            if (!transaction) return;

            transaction.modifiedDate = transaction.modifiedDate ? new Date().getTime() : transaction.createdDate;
            transaction.amount = transaction.amount.clean(
                currencies.find(({ label }) => label === transaction.currency)?.decimals
            );
            transaction.validator = parameters.user.name;

            // Build the updated transactions array to save
            const transactionsToSave = [...transactions];
            if (action === DatabaseAction.add) {
                // For new transactions, check if it already exists (by createdDate)
                const existingIndex = transactionsToSave.findIndex((tx) => tx.createdDate === transaction.createdDate);
                if (existingIndex >= 0) {
                    transactionsToSave.splice(existingIndex, 1, transaction);
                } else {
                    transactionsToSave.unshift(transaction);
                }
            } else if (action === DatabaseAction.hardDelete) {
                // Completely remove from the array — no DELETED record should remain
                const existingIndex = transactionsToSave.findIndex((tx) => tx.createdDate === transaction.createdDate);
                if (existingIndex >= 0) {
                    transactionsToSave.splice(existingIndex, 1);
                }
            } else {
                // For update/delete, find and replace the transaction
                const existingIndex = transactionsToSave.findIndex((tx) => tx.createdDate === transaction.createdDate);
                if (existingIndex >= 0) {
                    transactionsToSave.splice(existingIndex, 1, transaction);
                }
            }

            // Always persist to localStorage (including deleted-flagged transactions)
            setLocalStorageItem(transactionsFilename, transactionsToSave);

            const index = transaction.createdDate;
            transactionId.current = action === DatabaseAction.update ? index : 0;

            if (USE_DIGICARTE || (await checkDbConfig())) {
                try {
                    // Prepare the transaction data for SQL DB
                    const sqlTransactionData = {
                        action: DatabaseAction[action],
                        transaction: {
                            id: index,
                            order_id: orderId || String(transaction.createdDate),
                            customer_name: transaction.customerName
                                ? transaction.customerName
                                : currentCustomer
                                  ? `${currentCustomer.firstName} ${currentCustomer.lastName}`.trim() || null
                                  : null,
                            user_name: transaction.validator,
                            payment_method: transaction.method,
                            amount: transaction.amount,
                            currency: transaction.currency,
                            change: encodeCashNote(transaction.cashAmount, transaction.change),
                            takeOut: transaction.takeOut ?? false,
                            employer_share: transaction.employerShare ?? null,
                            fidelity_points: transaction.fidelityPointsUsed ?? null,
                            created_at: toSQLDateTime(transaction.createdDate),
                            updated_at: toSQLDateTime(transaction.modifiedDate || transaction.createdDate),
                            products: transaction.products.map((product) => ({
                                label: product.label,
                                category: product.category,
                                amount: product.amount,
                                quantity: product.quantity,
                                discount_amount: product.discount.amount,
                                discount_unit: product.discount.unit,
                                total: product.total || 0,
                                vat_rate: product.vatRate,
                            })),
                        },
                    };

                    // Call the SQL API endpoint to handle the transaction
                    const response = await fetch('/api/sql/saveTransaction', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(sqlTransactionData),
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        console.error('SQL DB transaction error:', error);
                        throw new Error(error.error || 'Failed to save transaction to SQL DB');
                    }

                    // Notify WebSocket server that the order is complete
                    // Only send notification for actual payments (not for EN ATTENTE or REMBOURSEMENT)
                    const isActualPayment =
                        !isWaitingTransaction(transaction) &&
                        !isRefundTransaction(transaction) &&
                        !isDeletedTransaction(transaction) &&
                        !isProcessingTransaction(transaction) &&
                        !isUpdatingTransaction(transaction);

                    if (orderId && isActualPayment) {
                        try {
                            await fetch('/api/complete-order', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ order_id: orderId }),
                            });
                        } catch (wsError) {
                            console.error('Failed to notify WebSocket server:', wsError);
                            // Don't throw - this is not critical to the transaction
                        }
                    } else if (!orderId && isActualPayment && isKitchenViewEnabled && transaction.products.length > 0) {
                        // Counter order: create panier in DB with short_num_order + broadcast to kitchen
                        // NOTE: use transaction.products (captured before clearTotal empties products.current)
                        try {
                            const counterResponse = await fetch('/api/counter-order', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    products: transaction.products.map((p) => ({
                                        label: p.label,
                                        category: p.category,
                                        quantity: p.quantity,
                                        options: p.options ?? null,
                                    })),
                                    service_type: serviceTypeToDb(counterServiceTypeRef.current),
                                    ...(contextTableId ? { table_id: Number(contextTableId) } : {}),
                                }),
                            });
                            if (counterResponse.ok) {
                                const counterData = await counterResponse.json();
                                if (counterData.short_num_order) {
                                    setShortNumOrder(counterData.short_num_order);
                                    // Update the already-stored transaction with the order number
                                    transaction.shortNumOrder = counterData.short_num_order;
                                    storeTransaction(transaction);
                                    // Persist shortNumOrder to localStorage (storeTransaction only updates React state)
                                    setLocalStorageItem(transactionsFilename, transactions);
                                }
                            } else {
                                console.error('counter-order upstream error:', await counterResponse.text());
                            }
                        } catch (kitchenError) {
                            console.error('Failed to send counter order:', kitchenError);
                            // Non-critical — transaction already saved
                        }
                    }
                } catch (error) {
                    console.error('Error handling SQL DB transaction:', error);
                    throw error;
                }
            }
        },
        [
            transactionsFilename,
            transactions,
            parameters.user,
            setLocalStorageItem,
            currencies,
            orderId,
            currentCustomer,
            contextTableId,
            setShortNumOrder,
            storeTransaction,
            isKitchenViewEnabled,
        ]
    );

    const deleteTransaction = useCallback(
        (index?: number) => {
            if (!transactions.length) return;

            index = index ?? transactions.findIndex(({ createdDate }) => createdDate === transactionId.current);
            // If not found by transactionId, fall back to finding the PROCESSING tx by validator.
            // This happens because saveTransactions resets transactionId.current to 0 after 'add'.
            if (index < 0) {
                index = transactions.findIndex(
                    (t) => isProcessingTransaction(t) && t.validator === parameters.user.name
                );
            }

            if (index >= 0) {
                const transaction = transactions[index];
                if (isProcessingTransaction(transaction)) {
                    // PROCESSING transactions are transient — hard-delete them from DB
                    // instead of leaving a DELETED record. saveTransactions handles
                    // removing from both React state (via transactionsToSave) and IndexedDB.
                    saveTransactions(DatabaseAction.hardDelete, transaction);
                    setTransactions((prev) => prev.filter((_, i) => i !== index));
                } else {
                    transaction.method = DELETED_KEYWORD;
                    storeTransaction(transaction);
                    saveTransactions(DatabaseAction.delete, transaction);
                }
            }
        },
        [transactions, saveTransactions, storeTransaction, parameters.user.name]
    );

    // clearTotal calls deleteTransaction to remove the PROCESSING tx after payment.
    // But there's a race: updateTransaction calls storeTransaction (queues state update)
    // then clearTotal → deleteTransaction. deleteTransaction's `transactions` closure
    // is stale — it still sees the old PROCESSING tx, so it hard-deletes the tx that was
    // just paid. This uses a functional state update to check the CURRENT state instead.
    // The side effect (saveTransactions) is deferred to a useEffect so the updater stays pure.
    const pendingHardDeleteRef = useRef<Transaction | null>(null);
    const clearProcessingTransaction = useCallback(() => {
        setTransactions((prev) => {
            const idx = prev.findIndex((t) => isProcessingTransaction(t) && t.validator === parameters.user.name);
            if (idx < 0) return prev;
            // Only hard-delete if it's STILL a PROCESSING tx in the current state.
            // If it was already updated to a paid tx by storeTransaction, skip.
            pendingHardDeleteRef.current = prev[idx];
            return prev.filter((_, i) => i !== idx);
        });
    }, [parameters.user.name]);
    // Flush the deferred hard-delete. Depends on `transactions` (not just
    // saveTransactions) because clearProcessingTransaction always changes
    // `transactions` when it sets the ref — relying on saveTransactions'
    // identity alone would silently drop the delete if it ever stopped
    // depending on `transactions`, leaking PROCESSING rows in the DB.
    useEffect(() => {
        if (pendingHardDeleteRef.current) {
            const tx = pendingHardDeleteRef.current;
            pendingHardDeleteRef.current = null;
            saveTransactions(DatabaseAction.hardDelete, tx);
        }
    }, [transactions, saveTransactions]);

    const toCurrency = useCallback(
        (element: { amount: number; currency?: string } | number | Product | Transaction) => {
            const currency =
                (typeof element !== 'number' && element.hasOwnProperty('currency')
                    ? currencies.find(({ label }) => label === (element as { currency: string }).currency)
                    : undefined) ?? currencies[currencyIndex];
            const amount = Number(
                element.hasOwnProperty('amount') ? (element as { amount: number }).amount : (element as number)
            );
            return amount.toCurrency(currency.decimals, currency.symbol);
        },
        [currencies, currencyIndex]
    );

    const { toMercurial, fromMercurial } = useMercurial(currentMercurial);

    const getCurrentTotal = useCallback(() => {
        return products.current ? products.current.reduce((t, { total }) => t + (total ?? 0), 0) : 0;
    }, [products]);

    // The amount the customer actually pays: products total minus the employer
    // share (capped at 0 so the total never goes negative).
    const getCustomerTotal = useCallback(() => {
        return Math.max(0, getCurrentTotal() - employerShare);
    }, [getCurrentTotal, employerShare]);

    const updateTotal = useCallback(() => {
        setTotal(getCustomerTotal());
    }, [getCustomerTotal]);

    const clearAmount = useCallback(() => {
        setAmount(0);
        setQuantity(0);
        setCurrentMercurial(parameters.mercurial);
        setSelectedProduct(undefined);
        updateTotal();
    }, [updateTotal, parameters.mercurial]);

    const clearTotal = useCallback(() => {
        products.current = [];
        clearRequestedRef.current = true;
        clearProcessingTransaction();
        clearAmount();
        setShortNumOrder('');
        setOrderId('');
    }, [clearAmount, clearProcessingTransaction]);

    // Recalculate the total when the employer share changes (e.g. customer
    // selected/deselected, or companies list loaded after products were added).
    useEffect(() => {
        if (products.current.length > 0) updateTotal();
    }, [employerShare, updateTotal]);

    const computeDiscount = useCallback((product: Product) => {
        return product.discount.unit === '%'
            ? product.amount * (1 - product.discount.amount / 100)
            : product.amount - product.discount.amount;
    }, []);

    const setDiscount = useCallback(
        (product: Product, discount: Discount) => {
            product.discount = discount;
            product.total = computeDiscount(product) * toMercurial(product.quantity, product.mercurial);
            updateTotal();
        },
        [updateTotal, computeDiscount, toMercurial]
    );

    const computeQuantity = useCallback(
        (product: Product, quantity: number) => {
            const maxValue = currencies[currencyIndex].maxValue;
            const quadratic = toMercurial(quantity, product.mercurial);
            const amount = computeDiscount(product);

            product.quantity =
                amount * quadratic <= maxValue
                    ? quantity
                    : fromMercurial(maxValue / amount, maxValue, product.mercurial);
            product.total = amount * toMercurial(product.quantity, product.mercurial);

            setQuantity(product.quantity);
            updateTotal();
        },
        [currencies, currencyIndex, toMercurial, fromMercurial, updateTotal, computeDiscount]
    );

    const addProduct = useCallback(
        (item?: Product) => {
            const product = item ?? selectedProduct;
            if (!product) return;

            const newQuantity = item ? product.quantity : 1;

            if (!product.label && !product.category) return;

            const p = products.current.find(
                ({ label, category, amount, options }) =>
                    label === product.label &&
                    category === product.category &&
                    amount === product.amount &&
                    options === product.options
            );
            if (p) {
                computeQuantity(p, newQuantity + p.quantity);
            } else {
                products.current.unshift(product);
                computeQuantity(product, newQuantity);
            }

            setSelectedProduct(p ?? product);
            setAmount(product.amount);
            setQuantity(product.amount ? -1 : 0);
            saveProcessingTransactionRef.current();
        },
        [products, selectedProduct, computeQuantity]
    );

    const deleteProduct = useCallback(
        (index: number) => {
            if (!products.current.length || !products.current.at(index)) return;

            const wasSelected = products.current.at(index) === selectedProduct;
            products.current.splice(index, 1);

            if (!products.current.length) {
                clearRequestedRef.current = true;
                deleteTransaction();
            }

            const selection = resolveSelectionAfterDelete(products.current, index, wasSelected);
            if (selection) {
                setSelectedProduct(selection.selectedProduct);
                setAmount(selection.amount);
                setQuantity(selection.quantity);
                // clearAmount() is skipped here, so the total must be refreshed explicitly
                updateTotal();
            } else {
                clearAmount();
            }
            // Persist the updated product list (or trigger cleanup if empty)
            saveProcessingTransactionRef.current();
        },
        [
            products,
            selectedProduct,
            clearAmount,
            deleteTransaction,
            setSelectedProduct,
            setAmount,
            setQuantity,
            updateTotal,
        ]
    );

    const removeProduct = useCallback(
        (item?: Product) => {
            const product = item ?? {
                category: selectedProduct?.category,
                label: selectedProduct?.label,
                amount: selectedProduct?.amount,
            };
            const p = products.current.find(
                ({ label, category, amount }) =>
                    label === product.label && category === product.category && amount === product.amount
            );

            if (!p) return;

            if (p.quantity <= 1) {
                deleteProduct(products.current.indexOf(p));
            } else {
                computeQuantity(p, p.quantity - 1);
            }
        },
        [selectedProduct, products, computeQuantity, deleteProduct]
    );

    const displayProduct = useCallback(
        (product: Product, currency?: string) => {
            const name = product.label && product.label !== OTHER_KEYWORD ? product.label : product.category;
            const priceUnit = toCurrency({ amount: product.amount, currency });
            const discountSuffix = product.discount.amount
                ? ' (-' + product.discount.amount + product.discount.unit + ')'
                : '';
            const priceSuffix =
                product.quantity === 1
                    ? ` : ${priceUnit}${discountSuffix}`
                    : ` : ${priceUnit} x ${product.quantity} = ${toCurrency({ amount: product.total ?? 0, currency })}${discountSuffix}`;

            if (product.options) {
                try {
                    const parsed: { type: string; value: string; price: number }[] = JSON.parse(product.options);
                    // Formula product: elements stored with type === 'element'
                    if (parsed.length > 0 && parsed[0].type === 'element') {
                        const elementLines = parsed.map((o) => `  · ${o.value}`).join('\n');
                        return `${name}${priceSuffix}\n${elementLines}`;
                    }
                    // Regular product with paid/free options
                    const parts = parsed.map((o) =>
                        o.price > 0 && o.price !== product.amount
                            ? `${o.value} (+${toCurrency({ amount: o.price, currency })})`
                            : o.value
                    );
                    if (parts.length > 0) {
                        return `${name} [${parts.join(', ')}]${priceSuffix}`;
                    }
                } catch {
                    // ignore
                }
            }
            return `${name}${priceSuffix}`;
        },
        [toCurrency]
    );

    useEffect(() => {
        // If clearTotal was recently called, don't restore a stale PROCESSING transaction.
        // Keep blocking until the processing transaction is actually gone from state.
        if (clearRequestedRef.current) {
            const processingStillExists = transactions.some(
                (t) => isProcessingTransaction(t) && t.validator === parameters.user.name
            );
            if (!processingStillExists) clearRequestedRef.current = false;
            return;
        }
        const processingTransaction = !products.current.length
            ? transactions.find(
                  (transaction) =>
                      isProcessingTransaction(transaction) && transaction.validator === parameters.user.name
              )
            : undefined;
        if (processingTransaction) {
            transactionId.current = processingTransaction.createdDate;
            processingTransaction.products.forEach(addProduct);
        }
    }, [transactions, parameters.user, addProduct]);

    // Debounced save of current products as a PROCESSING transaction so they survive
    // navigation to admin or page refresh. Called from addProduct/deleteProduct.
    const autoSaveProcessingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveProcessingTransactionRef = useRef<() => void>(() => {});
    const saveProcessingTransaction = useCallback(() => {
        if (!areTransactionLoaded.current) return;
        if (clearRequestedRef.current) return;
        if (suppressAutoSaveRef.current) return;

        if (autoSaveProcessingRef.current) clearTimeout(autoSaveProcessingRef.current);

        autoSaveProcessingRef.current = setTimeout(() => {
            const hasProducts = products.current.length > 0;
            const existingProcessing = transactions.find(
                (t) => isProcessingTransaction(t) && t.validator === parameters.user.name
            );

            if (hasProducts && !existingProcessing) {
                // Create a new PROCESSING transaction
                const now = floorToSeconds(new Date().getTime());
                const transaction: Transaction = {
                    validator: parameters.user.name,
                    method: PROCESSING_KEYWORD,
                    amount: getCustomerTotal(),
                    createdDate: now,
                    modifiedDate: now,
                    currency: currencies[currencyIndex].label,
                    products: products.current.map((p) => ({ ...p })),
                    takeOut: counterServiceTypeRef.current === 'takeout',
                    ...(employerShare > 0 ? { employerShare } : {}),
                };
                transactionId.current = now;
                storeTransaction(transaction);
                saveTransactions(DatabaseAction.add, transaction);
            } else if (hasProducts && existingProcessing) {
                // Update the existing PROCESSING transaction with current products
                existingProcessing.products = products.current.map((p) => ({ ...p }));
                existingProcessing.amount = getCustomerTotal();
                if (employerShare > 0) {
                    existingProcessing.employerShare = employerShare;
                } else {
                    delete existingProcessing.employerShare;
                }
                existingProcessing.modifiedDate = floorToSeconds(new Date().getTime());
                storeTransaction(existingProcessing);
                saveTransactions(DatabaseAction.update, existingProcessing);
            }
        }, 500);
    }, [
        transactions,
        parameters.user,
        currencies,
        currencyIndex,
        getCustomerTotal,
        employerShare,
        storeTransaction,
        saveTransactions,
    ]);
    saveProcessingTransactionRef.current = saveProcessingTransaction;

    const editTransaction = useCallback(
        (index: number, override?: Transaction) => {
            const transaction = override ?? transactions.at(index);
            if (!transaction?.amount) return;

            // Track if this tx was WAITING — the kitchen already received a ticket when it was put on hold.
            wasWaitingBeforeEditRef.current = isWaitingTransaction(transaction);
            // Snapshot the original products to compute the delta when the tx is committed
            originalProductsSnapshotRef.current = transaction.products.map((p) => ({ ...p }));

            setCurrency(transaction.currency);
            suppressAutoSaveRef.current = true;
            transaction.products.forEach(addProduct);
            suppressAutoSaveRef.current = false;
            transaction.method = PROCESSING_KEYWORD;

            saveTransactions(DatabaseAction.update, transaction);
        },
        [transactions, saveTransactions, addProduct, setCurrency]
    );

    const updateTransaction = useCallback(
        (item: string | Transaction) => {
            if (!item || (typeof item === 'string' && !products.current.length)) return;

            const currentTime = floorToSeconds(new Date().getTime()); // floor to seconds to match SQL TIMESTAMP precision
            // When paying, find the existing PROCESSING transaction to update.
            // transactionId.current may be 0 because saveTransactions resets it to 0 after an 'add'
            // (which is what saveProcessingTransaction uses). Fall back to looking up the PROCESSING
            // tx by validator so we can reuse its createdDate — this makes the PAID tx replace the
            // PROCESSING tx (same createdDate) instead of creating a duplicate row in the DB.
            const existingTransaction = transactionId.current
                ? transactions.find((tx) => tx.createdDate === transactionId.current)
                : transactions.find((t) => isProcessingTransaction(t) && t.validator === parameters.user.name);

            const transaction: Transaction =
                typeof item === 'object'
                    ? {
                          ...item,
                          createdDate:
                              (existingTransaction?.createdDate || transactionId.current) && !isRefundTransaction(item)
                                  ? existingTransaction?.createdDate || transactionId.current
                                  : item.createdDate,
                          ...(shortNumOrder && !item.shortNumOrder ? { shortNumOrder } : {}),
                      }
                    : {
                          validator: parameters.user.name,
                          method: item,
                          amount: getCustomerTotal(),
                          createdDate: existingTransaction?.createdDate || transactionId.current || currentTime,
                          modifiedDate: currentTime,
                          currency: currencies[currencyIndex].label,
                          customerName: existingTransaction?.customerName,
                          products: products.current,
                          takeOut: counterServiceTypeRef.current === 'takeout',
                          ...(employerShare > 0 ? { employerShare } : {}),
                          ...(shortNumOrder ? { shortNumOrder } : {}),
                      };

            storeTransaction(transaction);
            saveTransactions(DatabaseAction.add, transaction);

            clearTotal();
        },
        [
            clearTotal,
            products,
            saveTransactions,
            getCustomerTotal,
            currencies,
            currencyIndex,
            storeTransaction,
            parameters,
            shortNumOrder,
            transactions,
            employerShare,
        ]
    );

    const reverseTransaction = useCallback(
        (transaction: Transaction): Transaction => {
            const reversedProducts = transaction.products.map((product) => {
                const reversedProduct = { ...product };
                // Use computeQuantity with negative quantity to properly calculate reversed values
                computeQuantity(reversedProduct, -product.quantity);
                return reversedProduct;
            });

            return {
                ...transaction,
                amount: -transaction.amount,
                products: reversedProducts,
            };
        },
        [computeQuantity]
    );

    // Create a new REFUND tx from an existing tx, without loading products or mutating the original.
    // The original tx stays unchanged; a new tx with reversed products is added to the list.
    // Returns the created refund tx so the caller can print it.
    const refundTransaction = useCallback(
        (index: number): Transaction | undefined => {
            const transaction = transactions.at(index);
            if (!transaction?.amount) return;

            const reversedTransaction = reverseTransaction(transaction);
            const now = floorToSeconds(new Date().getTime());
            const refundTx: Transaction = {
                ...reversedTransaction,
                method: REFUND_KEYWORD,
                createdDate: now,
                modifiedDate: now,
            };

            storeTransaction(refundTx);
            saveTransactions(DatabaseAction.add, refundTx);
            return refundTx;
        },
        [transactions, reverseTransaction, storeTransaction, saveTransactions]
    );

    const displayTransaction = useCallback(
        (transaction: Transaction) => {
            if (!transaction.modifiedDate || !transaction.method) return '';
            return (
                toCurrency(transaction) +
                (isWaitingTransaction(transaction) ? ' ' : ' en ') +
                transaction.method +
                ' à ' +
                new Date(transaction.modifiedDate).toTimeString().slice(0, 9)
            );
        },
        [toCurrency]
    );

    return (
        <DataContext.Provider
            value={{
                total,
                getCurrentTotal,
                getCustomerTotal,
                employerShare,
                amount,
                setAmount,
                quantity,
                setQuantity,
                computeQuantity,
                setDiscount,
                toMercurial,
                setCurrentMercurial,
                selectedProduct,
                setSelectedProduct,
                addProduct,
                removeProduct,
                deleteProduct,
                displayProduct,
                clearAmount,
                clearTotal,
                products,
                transactions,
                processTransactions,
                getAvailableDaysFromSQL,
                syncSpecificDayFromSQL,
                updateTransaction,
                editTransaction,
                refundTransaction,
                deleteTransaction,
                displayTransaction,
                reverseTransaction,
                transactionsFilename,
                toCurrency,
                isDbConnected,
                orderId,
                setOrderId,
                shortNumOrder,
                setShortNumOrder,
                orderData,
                setOrderData,
                selectedOrderItems,
                setSelectedOrderItems,
                partialPaymentAmount,
                setPartialPaymentAmount,
                showPartialPaymentSelector,
                setShowPartialPaymentSelector,
                counterServiceType,
                setCounterServiceType,
                contextTableId,
                setContextTableId,
                checkAndPerformDayReset,
                currentCustomer,
                setCurrentCustomer,
                wasWaitingBeforeEditRef,
                originalProductsSnapshotRef,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
