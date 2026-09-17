'use client';

import { ChangeEvent, FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { DataContext } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { useWindowParam } from '../hooks/useWindowParam';
import {
    CANCELLED_KEYWORD,
    DELETED_KEYWORD,
    OTHER_KEYWORD,
    PROCESSING_KEYWORD,
    REFUND_KEYWORD,
    SYNC_INTERVAL_MS,
    TRANSACTIONS_KEYWORD,
    USE_DIGICARTE,
} from '../utils/constants';
import { getFormattedDate, getTransactionFileName, toSQLDateTime } from '../utils/date';
import { useLocalStorage } from '../utils/localStorage';
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
    idbGetAllKeys,
    idbGetAllTransactionSets,
    idbGetTransactions,
    idbRemoveTransactions,
    idbSetTransactions,
} from '../utils/transactionStore';
import { checkDbConfig, getPublicKey } from '../utils/processData';
import { encodeCashNote, encodePaymentLegs } from '../utils/transactionNote';
import { computeSoldQuantities, computeCartQuantities, deriveEffectiveStock, stockKey } from '../utils/stock';
import { mergeTransactionArrays } from './dataProvider/syncUtils';
import {
    isCancelledTransaction,
    isConfirmedTransaction,
    isDeletedTransaction,
    isDraftTransaction,
    isProcessingTransaction,
    isRefundTransaction,
    isUpdatingTransaction,
    isWaitingTransaction,
} from './dataProvider/transactionHelpers';
import { useMercurial } from './dataProvider/useMercurial';
import { resolveSelectionAfterDelete } from './dataProvider/productHelpers';
import { useShopId } from '../hooks/useShopId';
import { useSubscription } from '../hooks/useSubscription';
import { deviceFetch } from '@/app/utils/deviceFetch';

const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit, timeout = 15000): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
};

enum DatabaseAction {
    add = 'add',
    update = 'update',
    delete = 'delete',
    expunge = 'expunge',
    sync = 'sync',
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
    const {
        currencies,
        currencyIndex,
        setCurrency,
        parameters,
        isKitchenViewEnabled,
        categories,
        customers,
        reloadConfig,
    } = useConfig();
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
    // Dates known to be Z-closed (server rejected a write with DAY_CLOSED, or
    // a dailyClosure check confirmed it) — lets saveTransactions refuse a
    // sealed-day write BEFORE mutating local state.
    const closedDaysRef = useRef<Set<string>>(new Set());
    // Days already reported to the user — a sealed tx is dropped on every
    // background sync cycle, so the popup must fire once per day, not per tx.
    const sealedNotifiedRef = useRef<Set<string>>(new Set());
    const areTransactionLoaded = useRef(false);
    const [transactionsLoaded, setTransactionsLoaded] = useState(false);
    const [isCashClosed, setIsCashClosed] = useLocalStorage('cashClosedDate', '');
    const isCashClosedToday = isCashClosed === new Date().toISOString().slice(0, 10);
    // A stopped subscription locks the POS exactly like a daily closure: every
    // mutating path is blocked, only Z / calculator / search / topnav remain.
    const { status: subscriptionStatus, loaded: subscriptionLoaded, limits: planLimits } = useSubscription();
    const subscriptionStopped = subscriptionLoaded && subscriptionStatus === 'stopped';
    const isLocked = isCashClosedToday || subscriptionStopped;
    const setCashClosed = useCallback(
        (closed: boolean) => {
            setIsCashClosed(closed ? new Date().toISOString().slice(0, 10) : '');
        },
        [setIsCashClosed]
    );

    // ── Stock tracking (derived from transactions + live cart) ──
    // Effective stock is derived from: configured stock minus sold quantities
    // (from today's committed transactions) minus the current cart. This
    // replaces the old localStorage-based decrement model which double-decremented
    // on page refresh, transaction edit, and counter-order restore, and never
    // restored stock on deletion.
    //
    // A cartVersion counter is bumped on every cart mutation so the memo
    // recomputes immediately rather than waiting for the debounced save.
    const [cartVersion, setCartVersion] = useState(0);
    const bumpCartVersion = useCallback(() => setCartVersion((v) => v + 1), []);

    const soldQuantities = useMemo(
        // getPublicKey() accesses localStorage, which is unavailable during SSR.
        // On the server, pass undefined so all transactions are counted as sold
        // (no device exclusion). On the client, the real device ID is used.
        () => computeSoldQuantities(transactions, typeof window !== 'undefined' ? getPublicKey() : undefined),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [transactions, cartVersion]
    );

    const cartQuantities = useMemo(() => {
        // cartVersion is read here to trigger recompute on every cart mutation.
        // products.current is a ref, so without this dependency the memo would
        // return stale quantities.
        void cartVersion;
        return computeCartQuantities(products.current);
    }, [cartVersion]);

    const getEffectiveStock = useCallback(
        (category: string, label: string, configStock: number | null): number | null => {
            const key = stockKey(category, label);
            return deriveEffectiveStock(configStock, soldQuantities.get(key) ?? 0, cartQuantities.get(key) ?? 0);
        },
        [soldQuantities, cartQuantities]
    );
    // Set to true by clearTotal to prevent the product-restore effect from re-adding
    // stale items from PROCESSING transactions when transactions load asynchronously.
    const clearRequestedRef = useRef(false);
    // Set to true by editTransaction when the edited tx was WAITING, so commitTransaction
    // knows the kitchen already received a ticket and should not print another one.
    const wasWaitingBeforeEditRef = useRef(false);
    // Snapshot of the original products when editing a WAITING tx, used to compute the delta
    // (added/removed products) for the kitchen ticket when the tx is put back in WAITING or paid.
    const originalProductsSnapshotRef = useRef<Product[]>([]);
    // One-time cleanup: remove leftover `currentStock_*` localStorage keys from
    // the old decrement-based stock model. Runs once on mount.
    useEffect(() => {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('currentStock_')) keysToRemove.push(key);
        }
        for (const key of keysToRemove) localStorage.removeItem(key);
    }, []);
    // Set to true by editTransaction to suppress auto-save during addProduct calls
    // (editTransaction already saves the PROCESSING tx via saveTransactions).
    const suppressAutoSaveRef = useRef(false);
    // Tracks the createdDate of the current PROCESSING transaction so that
    // saveProcessingTransaction's debounced timeout doesn't create a duplicate
    // when it fires with a stale `transactions` closure.
    const processingTxCreatedDateRef = useRef<number>(0);
    const syncInProgress = useRef(false);
    const lastServerSyncTime = useRef<string | undefined>(undefined);
    // Day-file keys holding at least one transaction whose SQL push failed
    // (pendingSync flag). Drained by each sync cycle so failures self-heal.
    const pendingSyncFiles = useRef<Set<string>>(new Set());
    // Last push attempt per transaction — flagged transactions are retried at
    // most once a minute so a permanently-rejected row doesn't spam the API.
    const lastPushAttempt = useRef<Map<number, number>>(new Map());
    // One-shot per session: the reconciliation sweep that pushes local
    // day-files missing on the server. Re-armed when the device reconnects.
    const reconcileDone = useRef(false);
    const [orderId, setOrderId] = useState('');
    const [shortNumOrder, setShortNumOrder] = useState('');
    const [orderData, setOrderData] = useState<OrderData | null>(null);
    const [selectedOrderItems, setSelectedOrderItems] = useState<OrderItem[]>([]);
    const [partialPaymentAmount, setPartialPaymentAmount] = useState(0);
    const [showPartialPaymentSelector, setShowPartialPaymentSelector] = useState(false);
    const [counterServiceType, setCounterServiceTypeState] = useState<ServiceType>('takeout');
    const [contextTableId, setContextTableId] = useState('');
    const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
    const previousCustomerRef = useRef<Customer | null>(null);
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
        deviceFetch('/api/sql/getCompanies')
            .then((res) => res.json())
            .then((data) => {
                if (data.companies) setCompanies(data.companies);
            })
            .catch((error) => console.error('Failed to fetch companies:', error));
    }, [isDbConnected]);

    // Employer share amount (updated when the customer or cart changes).
    const [employerShare, setEmployerShare] = useState(0);

    useEffect(() => {
        setCurrentMercurial(parameters.mercurial);
    }, [parameters.mercurial]);

    const loadTransactionsFromSQL = useCallback(async (date?: Date) => {
        try {
            const dateStr = (date || new Date()).toISOString().split('T')[0];
            const response = await deviceFetch(`/api/sql/getTransactions?date=${dateStr}&period=day`);
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
                    setTransactionsLoaded(true);
                    setTransactionsFilename(filename);
                    return;
                }
            }

            // Filter local transactions by last reset time
            const { last: lastResetTime } = getResetTimes();
            const currentDayTransactions = localTransactions.filter((tx) => tx.createdDate >= lastResetTime);
            setTransactions(currentDayTransactions);
            areTransactionLoaded.current = true;
            setTransactionsLoaded(true);
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
        setTransactionsLoaded(false);
        setTransactionsFilename('');
        nextResetTime.current = getResetTimes().next;
        // Reset cash closure state on day reset
        setCashClosed(false);
        // Stock is derived from transactions, which are filtered to the new
        // business day on reload. No explicit stock reset is needed.
    }, [getResetTimes, setCashClosed]);

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
    // `isAuthoritative` must only be true when `cloudTransactionSets` holds the COMPLETE set of
    // transactions for the given day. Incremental syncs (`since=`) return a partial delta, and
    // pruning against a delta would destroy transactions that simply weren't modified recently.
    const fullSync = useCallback(
        async (
            cloudTransactionSets: TransactionSet[],
            _syncPeriod: SyncPeriod,
            isAuthoritative = false
        ): Promise<number> => {
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

                    // Remove PROCESSING transactions owned by OTHER devices that are no longer in
                    // the cloud. This propagates expunges across devices: when POS2 deletes its
                    // PROCESSING tx, it disappears from the server and must not linger on POS1.
                    //
                    // Guards:
                    // - `isAuthoritative`: never prune from a partial (incremental) delta.
                    // - today's set only: historical archives never hold PROCESSING rows.
                    // - other devices only: this device owns its own cart and may not have pushed
                    //   it to SQL yet, so pruning it would wipe the cashier's in-progress sale.
                    if (isAuthoritative && localTransactionSet.id === transactionsFilename) {
                        const currentDeviceId = getPublicKey();
                        const cloudTimestamps = new Set(
                            cloudTransactionSet.transactions.map((t) => floorToSeconds(t.createdDate))
                        );
                        updateTransactionSet.transactions = updateTransactionSet.transactions.filter(
                            (tx) =>
                                !isProcessingTransaction(tx) ||
                                !tx.deviceId ||
                                tx.deviceId === currentDeviceId ||
                                cloudTimestamps.has(floorToSeconds(tx.createdDate))
                        );
                    }

                    updateLocalTransaction(updateTransactionSet);
                }
            }

            // A draft re-dated by an auto day-closure arrives under its NEW
            // day but keeps order_id = the original createdDate — remove the
            // stale local copy from its old day so the moved cart doesn't
            // linger as a ghost that could be paid a second time.
            const redatedOrigins = new Set<number>();
            for (const set of cloudTransactionSets) {
                for (const t of set.transactions) {
                    if (
                        t.orderId &&
                        /^\d+$/.test(t.orderId) &&
                        isDraftTransaction(t) &&
                        floorToSeconds(Number(t.orderId)) !== floorToSeconds(t.createdDate)
                    ) {
                        redatedOrigins.add(floorToSeconds(Number(t.orderId)));
                    }
                }
            }
            if (redatedOrigins.size) {
                for (const set of localTransactionSets) {
                    const kept = set.transactions.filter(
                        (t) => !(isDraftTransaction(t) && redatedOrigins.has(floorToSeconds(t.createdDate)))
                    );
                    if (kept.length !== set.transactions.length) {
                        updateLocalTransaction({ id: set.id, transactions: kept });
                    }
                }
            }

            return syncedCount;
        },
        [getLocalTransactions, transactionsFilename, updateLocalTransaction]
    );

    // Persist the pendingSync flag on a locally-stored transaction. The save
    // path always writes the current day file, but a pushed transaction can
    // also live in its own createdDate day file — check both.
    const markPendingSync = useCallback(
        async (transaction: Transaction, pending: boolean) => {
            try {
                transaction.pendingSync = pending;
                const keys = new Set(
                    [
                        transactionsFilename,
                        getTransactionFileName(resolvedShopId, new Date(transaction.createdDate)),
                    ].filter((k): k is string => Boolean(k))
                );
                for (const key of keys) {
                    const txs = await idbGetTransactions(key);
                    const index = txs.findIndex((t) => t.createdDate === transaction.createdDate);
                    if (index === -1) continue;
                    txs[index].pendingSync = pending;
                    await idbSetTransactions(key, txs);
                    if (pending) {
                        pendingSyncFiles.current.add(key);
                    } else if (!txs.some((t) => t.pendingSync)) {
                        pendingSyncFiles.current.delete(key);
                    }
                    return;
                }
            } catch (error) {
                console.error('Failed to persist pendingSync flag:', error);
            }
        },
        [resolvedShopId, transactionsFilename]
    );

    const pushTransactionToSQL = useCallback(
        async (transaction: Transaction, action: 'add' | 'sync' = 'add') => {
            // A tx dated in a known sealed day stays local-only forever — its
            // real date can't change without falsifying the ledger. Tell the
            // user rather than dropping it silently.
            const sealedDay = toSQLDateTime(transaction.createdDate).slice(0, 10);
            if (closedDaysRef.current.has(sealedDay)) {
                if (!sealedNotifiedRef.current.has(sealedDay)) {
                    sealedNotifiedRef.current.add(sealedDay);
                    openFullscreenPopup(`Journée du ${sealedDay} clôturée — transaction conservée sur cet appareil`, [
                        'OK',
                    ]);
                }
                return;
            }
            try {
                const response = await deviceFetch('/api/sql/saveTransaction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action,
                        transaction: {
                            id: transaction.createdDate,
                            // Keep the server identity when known — a draft
                            // re-dated by an auto-closure has createdDate =
                            // new day but order_id = the original timestamp.
                            order_id: transaction.orderId ?? String(transaction.createdDate),
                            customer_name: transaction.customerName ?? null,
                            user_name: transaction.validator,
                            payment_method: transaction.method,
                            amount: transaction.amount,
                            currency: transaction.currency,
                            change: encodeCashNote(transaction.cashAmount, transaction.change),
                            takeOut: transaction.takeOut ?? false,
                            employer_share: transaction.employerShare ?? null,
                            fidelity_points: transaction.fidelityPointsUsed ?? null,
                            device_id: transaction.deviceId ?? null,
                            payments: encodePaymentLegs(transaction.payments ?? []) ?? null,
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
                    }),
                });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    if (response.status === 409 && error.code === 'DAY_CLOSED') {
                        // Sealed day — remember it so this tx stops being retried
                        // at every sync cycle.
                        closedDaysRef.current.add(String(error.closedDay));
                        console.warn(
                            `Transaction dated in sealed day ${error.closedDay} — kept local only (cannot rewrite a closed day)`
                        );
                        return;
                    }
                    console.error('Failed to push transaction to SQL:', error);
                    await markPendingSync(transaction, true);
                    return;
                }
                if (transaction.pendingSync) await markPendingSync(transaction, false);
            } catch (error) {
                console.error('Error pushing transaction to SQL:', error);
                await markPendingSync(transaction, true);
            }
        },
        [openFullscreenPopup, markPendingSync]
    );

    // Reconcile local storage → SQL: a transaction that never reached the
    // server (push failed under older code, seal lifted later, prolonged
    // outage) falls out of the incremental window and would stay local-only
    // forever. Compare each local day file's size with the server count for
    // that day — more rows locally means this device holds transactions the
    // DB lacks — then push the whole day (identical re-syncs are no-ops).
    // Flagged (pendingSync) transactions are retried too.
    const reconcileLocalToSQL = useCallback(async (): Promise<void> => {
        const response = await deviceFetch('/api/sql/getAvailableDates');
        if (!response.ok) return;
        const { counts } = (await response.json()) as { counts?: Record<string, number> };
        if (!counts) return;
        const localSets = await getLocalTransactions();
        for (const set of localSets) {
            const day = set.id.slice(set.id.lastIndexOf('_') + 1);
            const missingOnServer = set.transactions.length > (counts[day] ?? 0);
            if (!missingOnServer && !set.transactions.some((t) => t.pendingSync)) continue;
            for (const tx of set.transactions) {
                if (missingOnServer || tx.pendingSync) {
                    await pushTransactionToSQL(tx, 'add');
                }
            }
        }
    }, [getLocalTransactions, pushTransactionToSQL]);

    const processSyncFromSQL = useCallback(
        async (syncPeriod: SyncPeriod, onProgress?: (percent: number) => void): Promise<number> => {
            try {
                onProgress?.(5);

                // Include deleted transactions so deletions propagate across devices
                const sqlTransactions: Transaction[] = [];
                let latestServerNow: string | undefined;
                // A response is authoritative (a complete snapshot) only when we did NOT send
                // `since`. Incremental responses are partial deltas and must not drive deletions.
                let isAuthoritative = true;
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
                        isAuthoritative = false;
                    }
                    const response = await fetchWithTimeout(
                        `/api/sql/getTransactions?${urlParams.toString()}`,
                        { headers: { 'x-public-key': getPublicKey() } },
                        15000
                    );
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
                        const response = await fetchWithTimeout(
                            `/api/sql/getTransactions?period=full&includeDeleted=true&limit=${BATCH_SIZE}&offset=${batchOffset}`,
                            { headers: { 'x-public-key': getPublicKey() } },
                            30000
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
                        syncedCount += await fullSync(cloudTransactionSets, syncPeriod, isAuthoritative);
                        syncedDays++;
                        // Progress from 40% to 70% based on days synced
                        onProgress?.(40 + Math.floor((syncedDays / totalDays) * 30));
                    }
                }

                // Local→SQL push: only push local transactions that changed since the last
                // successful server sync. Because we fetch incrementally, sqlTransactions may
                // not contain unchanged rows, so we use the timestamp instead of presence in the
                // fetched list to decide what needs uploading.
                //
                // IMPORTANT: use lastServerSyncTime.current (the last SUCCESSFUL sync time),
                // not latestServerNow (the current server time from this response). If sync
                // has been failing (e.g. schema mismatch), lastServerSyncTime.current retains
                // the last successful sync time, so all transactions accumulated during the
                // failure period get pushed. Using latestServerNow here would only push
                // transactions from the last 5 seconds, losing everything else.
                onProgress?.(70);
                const localTransactions = await idbGetTransactions(transactionsFilename);
                let pushedCount = 0;
                const lastSyncMs = lastServerSyncTime.current ? new Date(lastServerSyncTime.current).getTime() : 0;
                const pushSinceMs = lastSyncMs ? lastSyncMs - 5000 : 0;
                // Flagged transactions always retry — they failed an earlier push
                // and would otherwise fall out of the incremental window and stay
                // local-only forever. Back off to one attempt per minute per tx.
                const retryDue = (tx: Transaction) =>
                    tx.pendingSync === true &&
                    Date.now() - (lastPushAttempt.current.get(tx.createdDate) ?? 0) >= 60_000;
                const changedLocal = localTransactions.filter(
                    (tx) => retryDue(tx) || (tx.modifiedDate || tx.createdDate) > pushSinceMs
                );
                if (changedLocal.length) {
                    const totalLocal = changedLocal.length;
                    let processedLocal = 0;
                    for (const localTx of changedLocal) {
                        processedLocal++;
                        lastPushAttempt.current.set(localTx.createdDate, Date.now());
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

                // Flagged transactions in OTHER day files (e.g. an old-day tx
                // edited today) aren't covered by the today's-file push above —
                // drain them here. The once-per-session reconcile below covers
                // flags persisted by a previous session.
                for (const key of Array.from(pendingSyncFiles.current)) {
                    if (key === transactionsFilename) continue;
                    const dayTransactions = await idbGetTransactions(key);
                    for (const tx of dayTransactions) {
                        if (retryDue(tx)) {
                            lastPushAttempt.current.set(tx.createdDate, Date.now());
                            await pushTransactionToSQL(tx, 'add');
                            pushedCount++;
                        }
                    }
                }

                if (latestServerNow) lastServerSyncTime.current = latestServerNow;

                // Once per session (re-armed on reconnect): recover
                // transactions that never reached the DB — they fall out of
                // the incremental window and stay local-only otherwise.
                if (!reconcileDone.current) {
                    reconcileDone.current = true;
                    try {
                        await reconcileLocalToSQL();
                    } catch (error) {
                        console.error('Local→SQL reconciliation failed:', error);
                    }
                }

                onProgress?.(100);
                return syncedCount + pushedCount;
            } catch (error) {
                console.error('Error syncing from SQL DB:', error);
                return 0;
            }
        },
        [fullSync, transactionsFilename, pushTransactionToSQL, resolvedShopId, reconcileLocalToSQL]
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
                const heartbeat = await fetchWithTimeout(
                    '/api/sql/heartbeat',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ publicKey }),
                    },
                    10000
                );
                if (!heartbeat.ok) return;
                const heartbeatData = (await heartbeat.json()) as { registered?: boolean };
                if (heartbeatData.registered === false) {
                    // The device was revoked — soft-reload in the background:
                    // data refreshes silently and resolveUser lands on the
                    // device-registration screen if the device is really gone.
                    await reloadConfig();
                    return;
                }
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
        const handleOnline = () => {
            // Reconnecting after an outage: re-run the reconciliation so
            // transactions stranded while offline get pushed automatically.
            reconcileDone.current = false;
            shouldRunSync();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('online', handleOnline);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', handleOnline);
        };
    }, [transactionsFilename, syncNow, resolvedShopId, reloadConfig]);

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
            reader.onerror = () => {
                openFullscreenPopup('Erreur lors de la lecture du fichier.', ['OK']);
            };

            reader.readAsText(file);
        },
        [setLocalStorageItem, openFullscreenPopup]
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
                case SyncAction.forcepush: {
                    // Push ALL local transactions to the SQL DB, regardless of timestamp.
                    // This is a recovery action for when sync has been failing (e.g. schema
                    // mismatch) and local transactions have accumulated in IndexedDB but
                    // were never pushed to the server.
                    onProgress?.(5);
                    const allKeys = await idbGetAllKeys();
                    let pushed = 0;
                    let processed = 0;
                    const totalKeys = allKeys.length;
                    for (const key of allKeys) {
                        const txs = await idbGetTransactions(key);
                        for (const tx of txs) {
                            await pushTransactionToSQL(tx, 'add');
                            pushed++;
                        }
                        processed++;
                        onProgress?.(5 + Math.floor((processed / Math.max(totalKeys, 1)) * 90));
                    }
                    onProgress?.(100);
                    return pushed;
                }
            }
            return 0;
        },
        [
            syncTransactions,
            exportTransactions,
            importTransactions,
            transactionsFilename,
            resolvedShopId,
            pushTransactionToSQL,
        ]
    );

    const getAvailableDaysFromSQL = useCallback(async (): Promise<string[]> => {
        try {
            const response = await deviceFetch('/api/sql/getAvailableDates');
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
                const response = await deviceFetch(`/api/sql/getTransactions?date=${date}&period=day`);
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

                // If syncing today, update the current transactions state so
                // the ticket count and other UI elements reflect the fresh data.
                const todayFilename = getTransactionFileName(resolvedShopId);
                if (filename === todayFilename) {
                    const { last: lastResetTime } = getResetTimes();
                    const currentDayTransactions = transactions.filter((tx) => tx.createdDate >= lastResetTime);
                    setTransactions(currentDayTransactions);
                }

                return transactions.length;
            } catch (error) {
                console.error('Error syncing specific day from SQL:', error);
                return 0;
            }
        },
        [resolvedShopId, getResetTimes]
    );

    // NF525: a Z-closed day is sealed server-side — any write dated in it is
    // rejected with 409 DAY_CLOSED. Checking first avoids mutating local
    // state for a write the server will refuse.
    const isDayClosed = useCallback(async (day: string): Promise<boolean> => {
        if (closedDaysRef.current.has(day)) return true;
        try {
            const res = await deviceFetch(`/api/sql/dailyClosure?date=${day}`);
            if (!res.ok) return false;
            const data = (await res.json()) as { closure?: unknown };
            if (data?.closure) {
                closedDaysRef.current.add(day);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }, []);

    // Seed known closed days once — lets mutation paths refuse sealed-day
    // edits synchronously before touching local state. Missed closures are
    // still caught lazily by isDayClosed and the 409 path.
    useEffect(() => {
        void (async () => {
            try {
                const res = await deviceFetch('/api/sql/dailyClosure?limit=365');
                if (!res.ok) return;
                const data = (await res.json()) as { closures?: { closure_date: string }[] };
                for (const c of data?.closures ?? []) {
                    const day = String(c.closure_date).slice(0, 10);
                    if (day) closedDaysRef.current.add(day);
                }
            } catch {
                // Offline — discovered lazily via isDayClosed / 409 responses.
            }
        })();
    }, []);

    // Automatic day closure at closingHour: when a closing-hour boundary has
    // passed (including while the app was off), seal every open calendar day
    // up to the day before the last boundary. The server call uses auto=true,
    // which re-dates leftover drafts to the new open day instead of refusing
    // the closure — an unpaid cart must never silently block the seal or be
    // deleted.
    const lastAutoCloseRef = useRef(0);
    const autoCloseInFlightRef = useRef(false);
    // Persisted when the server refuses an automatic closure — admin pages
    // read it to show a persistent warning banner until the day is closed.
    const [blocked, setBlocked] = useLocalStorage<{ day: string; code: string; at: number } | null>(
        'autoCloseBlocked',
        null
    );
    const autoCloseMissedDays = useCallback(async () => {
        if (!resolvedShopId || !isOnline) return;
        // In-flight guard: the effect can fire on reconnect while a sweep is
        // still awaiting a slow closure response — never overlap two runs.
        if (autoCloseInFlightRef.current) return;
        // Throttle: the effect also fires on reconnect, so a flapping
        // network shouldn't re-run the sweep constantly.
        if (Date.now() - lastAutoCloseRef.current < 60_000) return;
        lastAutoCloseRef.current = Date.now();
        autoCloseInFlightRef.current = true;
        try {
            const res = await deviceFetch('/api/sql/dailyClosure?limit=365');
            if (!res.ok) return;
            const data = (await res.json()) as { closures?: { closure_date: string }[] };
            const closedDays = new Set((data?.closures ?? []).map((c) => String(c.closure_date).slice(0, 10)));
            closedDays.forEach((d) => closedDaysRef.current.add(d));
            // The flagged day is now closed (manual closure, another device) —
            // clear the admin warning.
            if (blocked && closedDays.has(blocked.day)) setBlocked(null);

            // The boundary that just passed seals the calendar day BEFORE it —
            // sales between midnight and closingHour stay open until the next
            // boundary.
            const { last } = getResetTimes();
            const boundary = new Date(last);
            const cursor = new Date(boundary.getFullYear(), boundary.getMonth(), boundary.getDate() - 1);

            // Walk back from the target day until a known closure — a device
            // off for a few days catches up on every missed day, in order.
            const daysToClose: string[] = [];
            for (let i = 0; i < 60; i++) {
                const day = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
                if (closedDays.has(day)) break;
                daysToClose.unshift(day);
                cursor.setDate(cursor.getDate() - 1);
            }
            for (const day of daysToClose) {
                const r = await deviceFetch('/api/sql/dailyClosure', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // redate_to carries the device's local time — every other
                    // created_at is client-local, so CURRENT_TIMESTAMP (UTC)
                    // could strand a draft on the wrong calendar day.
                    body: JSON.stringify({
                        date: day,
                        closed_by: 'auto',
                        auto: true,
                        redate_to: toSQLDateTime(Date.now()),
                    }),
                });
                if (r.ok) {
                    closedDaysRef.current.add(day);
                    // The day finally closed — clear any admin warning.
                    if (blocked?.day === day) setBlocked(null);
                    continue;
                }
                if (r.status === 409) {
                    const body = (await r.json().catch(() => null)) as { code?: string } | null;
                    // Only cache days that are actually sealed: a closure
                    // exists (ALREADY_CLOSED) or the day sits inside a sealed
                    // month/year (PERIOD_SEALED — writes there are refused).
                    // PENDING_DRAFTS is transient — caching it would make the
                    // very drafts blocking the closure uncollectable.
                    if (body?.code === 'ALREADY_CLOSED' || body?.code === 'PERIOD_SEALED') {
                        closedDaysRef.current.add(day);
                        if (blocked?.day === day) setBlocked(null);
                        continue;
                    }
                    console.warn('[auto-close] day', day, 'could not be closed:', body?.code ?? r.status);
                    // Persist a marker the admin pages surface as a banner —
                    // a day without a Z-ticket must not go unnoticed.
                    setBlocked({ day, code: body?.code ?? 'ERROR', at: Date.now() });
                }
                break; // transient failure — retried at the next boundary
            }
        } catch {
            // Offline or unauthenticated — retried at the next boundary.
        } finally {
            autoCloseInFlightRef.current = false;
        }
    }, [resolvedShopId, isOnline, getResetTimes, blocked, setBlocked]);

    const autoCloseMountedRef = useRef(false);
    const wasOfflineRef = useRef(!isOnline);
    useEffect(() => {
        if (!resolvedShopId) return;
        // Fire immediately on mount and on the offline→online transition only
        // — not on every effect re-run (the callback's identity shifts with
        // isOnline/blocked, which used to trigger an unguarded sweep each time).
        const firstRun = !autoCloseMountedRef.current;
        autoCloseMountedRef.current = true;
        const justCameOnline = wasOfflineRef.current && isOnline;
        wasOfflineRef.current = !isOnline;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const scheduleNext = () => {
            const { next } = getResetTimes();
            timer = setTimeout(
                () => {
                    void autoCloseMissedDays().finally(scheduleNext);
                },
                Math.max(next - Date.now(), 0) + 5_000
            );
        };
        if (firstRun || justCameOnline) void autoCloseMissedDays();
        scheduleNext();
        return () => clearTimeout(timer);
    }, [resolvedShopId, isOnline, getResetTimes, autoCloseMissedDays]);

    // Synchronous check against the cached closure list — lets mutation
    // paths refuse a sealed-day write BEFORE mutating local state. Mirrors
    // the server rule: a tx is sealed by ANY closure on/after its day,
    // because the rechain rewrites downstream anchored hashes.
    const sealedTxDay = useCallback((tx: Transaction): string | null => {
        const day = toSQLDateTime(tx.createdDate).slice(0, 10);
        let min: string | null = null;
        for (const d of closedDaysRef.current) if (d >= day && (min === null || d < min)) min = d;
        return min;
    }, []);

    const saveTransactions = useCallback(
        async (action: DatabaseAction, transaction: Transaction, localOnly = false, stripDate?: number) => {
            if (isLocked) return;

            // Sealed-day guard: today's date can only be closed after a Z —
            // discovered via the 409 path below (and cached in closedDaysRef)
            // rather than a check on every sale. For older dates, check the
            // cached closure list (>= txDay for mutations, = txDay for
            // inserts) then fall back to an exact-day server lookup.
            const txDay = toSQLDateTime(transaction.createdDate).slice(0, 10);
            const today = toSQLDateTime(Date.now()).slice(0, 10);
            const isInsert = action === DatabaseAction.add || action === DatabaseAction.sync;
            let sealedDay: string | null = null;
            if (!localOnly) {
                if (txDay === today) {
                    sealedDay = closedDaysRef.current.has(txDay) ? txDay : null;
                } else if (isInsert) {
                    sealedDay = (await isDayClosed(txDay)) ? txDay : sealedTxDay(transaction);
                } else {
                    sealedDay = sealedTxDay(transaction) ?? ((await isDayClosed(txDay)) ? txDay : null);
                }
            }
            let staleCreatedDate: number | null = null;
            if (sealedDay) {
                if (action === DatabaseAction.add || action === DatabaseAction.sync) {
                    // A stale cart/order being finalized NOW: the sealed
                    // document stays untouched — record the sale as a new
                    // transaction dated today (the receipt's real date).
                    staleCreatedDate = transaction.createdDate;
                    transaction.createdDate = floorToSeconds(Date.now());
                    transaction.modifiedDate = transaction.createdDate;
                } else if (action === DatabaseAction.update || action === DatabaseAction.expunge) {
                    // Draft bookkeeping on a sealed row (mark PROCESSING or
                    // clear it after payment): the remote write is refused by
                    // the seal, but the LOCAL effect is legitimate — the
                    // eventual payment lands as a re-dated new tx, and the
                    // expunge must still clear the ghost draft locally or it
                    // could be paid twice. Keep it local-only.
                    localOnly = true;
                } else {
                    openFullscreenPopup(
                        sealedDay === txDay
                            ? `Journée du ${txDay} clôturée — modification impossible, émettez un avoir daté du jour`
                            : `Clôture du ${sealedDay} — transaction verrouillée, émettez un avoir daté du jour`,
                        ['OK']
                    );
                    return;
                }
            }

            transaction.modifiedDate = transaction.modifiedDate ? new Date().getTime() : transaction.createdDate;
            transaction.amount = transaction.amount.clean(
                currencies.find(({ label }) => label === transaction.currency)?.decimals
            );
            transaction.validator = parameters.user.name;

            // Build the updated transactions array to save — drop the stale
            // copy a DAY_CLOSED retry asked us to strip (its createdDate was
            // just re-dated, the sealed-day row must not stay as a ghost).
            const transactionsToSave = stripDate
                ? [...transactions].filter((tx) => tx.createdDate !== stripDate)
                : [...transactions];
            if (action === DatabaseAction.add) {
                // For new transactions, check if it already exists (by createdDate)
                const existingIndex = transactionsToSave.findIndex((tx) => tx.createdDate === transaction.createdDate);
                if (existingIndex >= 0) {
                    transactionsToSave.splice(existingIndex, 1, transaction);
                } else {
                    transactionsToSave.unshift(transaction);
                }
            } else if (action === DatabaseAction.expunge) {
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

            // Tag the current device on all transactions before persisting
            // so that localStorage/IndexedDB and the SQL DB both receive the deviceId.
            if (!transaction.deviceId) {
                transaction.deviceId = getPublicKey();
            }

            // Always persist to localStorage (including deleted-flagged transactions)
            setLocalStorageItem(transactionsFilename, transactionsToSave);

            const index = transaction.createdDate;
            transactionId.current = action === DatabaseAction.update ? index : 0;

            if (!localOnly && (USE_DIGICARTE || (await checkDbConfig()))) {
                try {
                    // Prepare the transaction data for SQL DB
                    const sqlTransactionData = {
                        action,
                        transaction: {
                            id: index,
                            // A re-dated sale: keep the known order_id — the
                            // auto-closure already moved that server row to
                            // the open day, so 'add' converges to an update of
                            // the SAME row instead of inserting a ghost.
                            // Without a known order_id (never synced), fall
                            // back to a fresh id — the sealed row keeps its own.
                            order_id: staleCreatedDate
                                ? (transaction.orderId ?? String(transaction.createdDate))
                                : transaction.orderId || orderId || String(transaction.createdDate),
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
                            device_id: transaction.deviceId ?? null,
                            payments: encodePaymentLegs(transaction.payments ?? []) ?? null,
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
                    const response = await deviceFetch('/api/sql/saveTransaction', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(sqlTransactionData),
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        console.error('SQL DB transaction error:', error);
                        if (response.status === 409 && error.code === 'DAY_CLOSED') {
                            closedDaysRef.current.add(String(error.closedDay));
                            // An insert/sync can still be saved by re-dating
                            // to the open day — covers seals the client didn't
                            // know about (month/year) and the case where the
                            // preserved order_id points at a still-sealed row.
                            if (isInsert && stripDate === undefined) {
                                const staleDate = transaction.createdDate;
                                // +1s when now floors to the same second —
                                // the fresh identity must differ from the
                                // sealed row's, which keeps the old order_id.
                                transaction.createdDate = Math.max(floorToSeconds(Date.now()), staleDate + 1000);
                                transaction.modifiedDate = transaction.createdDate;
                                // Fresh identity: the sealed server row keeps
                                // the old order_id; retrying it would 409 again.
                                transaction.orderId = String(transaction.createdDate);
                                // Drop the sealed-day copy everywhere — it was
                                // persisted moments ago and would stay as an
                                // unpayable ghost next to the re-dated row.
                                setTransactions((prev) => prev.filter((tx) => tx.createdDate !== staleDate));
                                return saveTransactions(action, transaction, localOnly, staleDate);
                            }
                            // Keep the local transaction — it exists on this
                            // device only (same posture as a stopped
                            // subscription) — but make it explicit.
                            // error.error names the sealing period (a LATER
                            // day, a month or a year), not necessarily the
                            // transaction's own day — keep its label and state
                            // the consequence.
                            const reason = String(error.error ?? `La journée du ${error.closedDay} est clôturée`).split(
                                ' — '
                            )[0];
                            openFullscreenPopup(`${reason} — transaction conservée sur cet appareil`, ['OK']);
                            return;
                        }
                        await markPendingSync(transaction, true);
                        throw new Error(error.error || 'Failed to save transaction to SQL DB');
                    }

                    if (transaction.pendingSync) await markPendingSync(transaction, false);

                    // The sale was re-dated out of a sealed day: drop the
                    // stale draft locally so it doesn't linger as a ghost
                    // (its sealed server twin can never be expunged).
                    if (staleCreatedDate) {
                        setLocalStorageItem(
                            transactionsFilename,
                            transactionsToSave.filter((t) => t.createdDate !== staleCreatedDate)
                        );
                        setTransactions((prev) => prev.filter((t) => t.createdDate !== staleCreatedDate));
                    }

                    // Notify WebSocket server that the order is complete
                    // Only send notification for actual payments (not for EN ATTENTE, REMBOURSEMENT, EFFACÉE, or ANNULÉE)
                    const isActualPayment =
                        !isWaitingTransaction(transaction) &&
                        !isRefundTransaction(transaction) &&
                        !isDeletedTransaction(transaction) &&
                        !isCancelledTransaction(transaction) &&
                        !isProcessingTransaction(transaction) &&
                        !isUpdatingTransaction(transaction);

                    if (orderId && isActualPayment) {
                        try {
                            await deviceFetch('/api/complete-order', {
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
                            const counterResponse = await deviceFetch('/api/counter-order', {
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
                    // The transaction is already stored locally — flag it so
                    // the sync loop retries the push automatically.
                    await markPendingSync(transaction, true);
                    // If the server refused it (stopped subscription), warn the
                    // cashier: the sale only exists on this device until the
                    // next sync.
                    const msg = error instanceof Error ? error.message : '';
                    if (msg.includes('Abonnement suspendu') || msg.includes('lecture seule')) {
                        openFullscreenPopup('Abonnement suspendu', [
                            "Cette vente n'a pas pu être enregistrée sur le serveur.",
                            "L'application est en lecture seule — reprenez l'abonnement dans Commerce > Abonnement.",
                        ]);
                    }
                    throw error;
                }
            }
        },
        [
            openFullscreenPopup,
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
            isLocked,
            isDayClosed,
            sealedTxDay,
            markPendingSync,
        ]
    );

    const deleteTransaction = useCallback(
        (index?: number): boolean => {
            if (isLocked) return false;
            if (!transactions.length) return false;
            const currentDeviceId = getPublicKey();

            index = index ?? transactions.findIndex(({ createdDate }) => createdDate === transactionId.current);
            // If not found by transactionId, fall back to finding the PROCESSING tx by device.
            // This happens because saveTransactions resets transactionId.current to 0 after an 'add'
            // (which is what saveProcessingTransaction uses).
            if (index < 0) {
                index = transactions.findIndex((t) => isProcessingTransaction(t) && t.deviceId === currentDeviceId);
            }

            if (index >= 0) {
                const transaction = transactions[index];
                // Refuse to delete a PROCESSING transaction that does not belong to this device.
                if (isProcessingTransaction(transaction) && transaction.deviceId !== currentDeviceId) return false;

                // A sealed confirmed transaction can never be cancelled —
                // refuse before mutating local state. Sealed drafts get a
                // local-only delete (the remote write would be refused; the
                // row is already hidden from sync).
                const sealedDay = sealedTxDay(transaction);
                if (sealedDay && isConfirmedTransaction(transaction)) {
                    openFullscreenPopup(
                        `Journée du ${sealedDay} clôturée — annulation impossible, émettez un avoir daté du jour`,
                        ['OK']
                    );
                    return false;
                }
                const localOnly = !!sealedDay;

                if (isProcessingTransaction(transaction)) {
                    // Soft-delete PROCESSING transactions (mark as CANCELLED) instead of
                    // expunging them. This ensures the deletion propagates to other
                    // devices via incremental sync: the updated modifiedDate makes the
                    // CANCELLED tx appear in the sync response, and fullSync replaces the
                    // local PROCESSING tx with the CANCELLED version (filtered out by UI).
                    // expunge is only used for clearProcessingTransaction (payment),
                    // where the paid tx replaces the PROCESSING tx with the same createdDate.
                    processingTxCreatedDateRef.current = 0;
                    if (autoSaveProcessingRef.current) {
                        clearTimeout(autoSaveProcessingRef.current);
                        autoSaveProcessingRef.current = null;
                    }
                    // Clear the cart so saveProcessingTransaction doesn't re-create the tx.
                    products.current = [];
                    clearRequestedRef.current = true;
                    transaction.method = CANCELLED_KEYWORD;
                    storeTransaction(transaction);
                    saveTransactions(DatabaseAction.delete, transaction, localOnly);
                } else {
                    transaction.method = DELETED_KEYWORD;
                    storeTransaction(transaction);
                    saveTransactions(DatabaseAction.delete, transaction, localOnly);
                }
            }
            return index >= 0;
        },
        [transactions, saveTransactions, storeTransaction, isLocked, sealedTxDay, openFullscreenPopup]
    );

    // clearTotal calls deleteTransaction to remove the PROCESSING tx after payment.
    // But there's a race: updateTransaction calls storeTransaction (queues state update)
    // then clearTotal → deleteTransaction. deleteTransaction's `transactions` closure
    // is stale — it still sees the old PROCESSING tx, so it expunges the tx that was
    // just paid. This uses a functional state update to check the CURRENT state instead.
    // The side effect (saveTransactions) is deferred to a useEffect so the updater stays pure.
    const pendingExpungeRef = useRef<Transaction | null>(null);
    const clearProcessingTransaction = useCallback(() => {
        const currentDeviceId = getPublicKey();
        setTransactions((prev) => {
            const idx = prev.findIndex((t) => isProcessingTransaction(t) && t.deviceId === currentDeviceId);
            if (idx < 0) return prev;
            // Only expunge if it's STILL a PROCESSING tx in the current state.
            // If it was already updated to a paid tx by storeTransaction, skip.
            pendingExpungeRef.current = prev[idx];
            return prev.filter((_, i) => i !== idx);
        });
    }, []);
    // Flush the deferred expunge. Depends on `transactions` (not just
    // saveTransactions) because clearProcessingTransaction always changes
    // `transactions` when it sets the ref — relying on saveTransactions'
    // identity alone would silently drop the delete if it ever stopped
    // depending on `transactions`, leaking PROCESSING rows in the DB.
    useEffect(() => {
        if (pendingExpungeRef.current) {
            const tx = pendingExpungeRef.current;
            pendingExpungeRef.current = null;
            saveTransactions(DatabaseAction.expunge, tx);
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

    // Compute the employer share: if the current customer belongs to a company
    // with a meal price, and at least one product is from a category tied to
    // that company, the employer pays the highest per-product share (or the
    // company meal price, if none) and it is capped at the total.
    const getEmployerShare = useCallback(() => {
        if (!planLimits.employerShare) return 0; // plan without quote-part
        if (!currentCustomer?.company) return 0;
        const company = companies.find((c) => c.name === currentCustomer.company);
        if (!company || !company.employerShare || company.employerShare <= 0) return 0;
        let share = 0;
        for (const product of products.current) {
            const category = categories.find((c) => c.name === product.category);
            if (category?.company !== currentCustomer.company) continue;
            share = Math.max(share, product.employerShare != null ? product.employerShare : company.employerShare);
        }
        if (share <= 0) return 0;
        return Math.min(share, getCurrentTotal());
    }, [currentCustomer?.company, companies, categories, getCurrentTotal, planLimits]);

    // The amount the customer actually pays: products total minus the employer
    // share (capped at 0 so the total never goes negative).
    const getCustomerTotal = useCallback(() => {
        return Math.max(0, getCurrentTotal() - getEmployerShare());
    }, [getCurrentTotal, getEmployerShare]);

    const updateTotal = useCallback(() => {
        const share = getEmployerShare();
        setEmployerShare(share);
        setTotal(Math.max(0, getCurrentTotal() - share));
    }, [getEmployerShare, getCurrentTotal]);

    const clearAmount = useCallback(() => {
        setAmount(0);
        setQuantity(0);
        setCurrentMercurial(parameters.mercurial);
        setSelectedProduct(undefined);
        updateTotal();
    }, [updateTotal, parameters.mercurial]);

    const clearTotal = useCallback(() => {
        if (isLocked) return;
        products.current = [];
        clearRequestedRef.current = true;
        // Cancel any pending debounced save so it doesn't re-save a stale
        // PROCESSING transaction after we've just cleared it.
        if (autoSaveProcessingRef.current) {
            clearTimeout(autoSaveProcessingRef.current);
            autoSaveProcessingRef.current = null;
        }
        processingTxCreatedDateRef.current = 0;
        clearProcessingTransaction();
        clearAmount();
        setShortNumOrder('');
        setOrderId('');
        bumpCartVersion();
    }, [clearAmount, clearProcessingTransaction, isLocked, bumpCartVersion]);

    // Recalculate the total when the customer, companies, or categories change
    // so the employer share is re-evaluated against the current cart.
    useEffect(() => {
        const previousCustomer = previousCustomerRef.current;
        previousCustomerRef.current = currentCustomer;

        if (previousCustomer !== currentCustomer && products.current.length > 0) {
            const filtered = products.current.filter((product) => {
                const category = categories.find((c) => c.name === product.category);
                if (!category?.company) return true;
                return category.company === currentCustomer?.company;
            });
            if (filtered.length !== products.current.length) {
                products.current = filtered;
                if (selectedProduct && !filtered.includes(selectedProduct)) {
                    setSelectedProduct(undefined);
                    setAmount(0);
                    setQuantity(0);
                }
                saveProcessingTransactionRef.current();
            }
        }
        if (products.current.length > 0) updateTotal();
    }, [currentCustomer, companies, categories, products, updateTotal, selectedProduct]);

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
            if (isLocked) return;
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
            bumpCartVersion();
            saveProcessingTransactionRef.current();
        },
        [products, selectedProduct, computeQuantity, isLocked, bumpCartVersion]
    );

    const deleteProduct = useCallback(
        (index: number) => {
            if (isLocked) return;
            if (!products.current.length || !products.current.at(index)) return;

            const wasSelected = products.current.at(index) === selectedProduct;
            products.current.splice(index, 1);

            if (!products.current.length) {
                clearRequestedRef.current = true;
                // Cancel any pending debounced save so it doesn't re-save a stale
                // PROCESSING transaction after we've just expunged it.
                if (autoSaveProcessingRef.current) {
                    clearTimeout(autoSaveProcessingRef.current);
                    autoSaveProcessingRef.current = null;
                }
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
            bumpCartVersion();
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
            isLocked,
            bumpCartVersion,
        ]
    );

    const removeProduct = useCallback(
        (item?: Product) => {
            if (isLocked) return;
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
                saveProcessingTransactionRef.current();
            }
        },
        [selectedProduct, products, computeQuantity, deleteProduct, isLocked]
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
        const currentDeviceId = getPublicKey();
        // If clearTotal was recently called, don't restore a stale PROCESSING transaction.
        // Keep blocking until the processing transaction is actually gone from state.
        if (clearRequestedRef.current) {
            const processingStillExists = transactions.some(
                (t) => isProcessingTransaction(t) && t.deviceId === currentDeviceId
            );
            if (!processingStillExists) clearRequestedRef.current = false;
            return;
        }
        const processingTransaction = !products.current.length
            ? transactions.find(
                  (transaction) => isProcessingTransaction(transaction) && transaction.deviceId === currentDeviceId
              )
            : undefined;
        if (processingTransaction) {
            transactionId.current = processingTransaction.createdDate;
            processingTxCreatedDateRef.current = processingTransaction.createdDate;
            if (processingTransaction.customerName) {
                const restored = customers.find(
                    (c) => `${c.firstName} ${c.lastName}`.trim() === processingTransaction.customerName?.trim()
                );
                if (restored) {
                    setCurrentCustomer(restored);
                    previousCustomerRef.current = restored;
                }
            }
            processingTransaction.products.forEach(addProduct);
        }
    }, [transactions, parameters.user, addProduct, customers]);

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
            const liveShare = getEmployerShare();
            const currentDeviceId = getPublicKey();
            const existingProcessing = transactions.find(
                (t) => isProcessingTransaction(t) && t.deviceId === currentDeviceId
            );

            if (hasProducts && !existingProcessing && processingTxCreatedDateRef.current) {
                // A PROCESSING tx was already created but isn't in the stale `transactions`
                // closure yet. Skip this save — the next debounced call will find it and update.
                return;
            }

            if (hasProducts && !existingProcessing) {
                // Create a new PROCESSING transaction
                const now = floorToSeconds(new Date().getTime());
                processingTxCreatedDateRef.current = now;
                const customerName = currentCustomer
                    ? `${currentCustomer.firstName} ${currentCustomer.lastName}`.trim() || undefined
                    : undefined;
                const transaction: Transaction = {
                    validator: parameters.user.name,
                    method: PROCESSING_KEYWORD,
                    amount: getCustomerTotal(),
                    createdDate: now,
                    modifiedDate: now,
                    currency: currencies[currencyIndex].label,
                    products: products.current.map((p) => ({ ...p })),
                    takeOut: counterServiceTypeRef.current === 'takeout',
                    deviceId: currentDeviceId,
                    ...(liveShare > 0 ? { employerShare: liveShare } : {}),
                    ...(customerName ? { customerName } : {}),
                };
                transactionId.current = now;
                storeTransaction(transaction);
                saveTransactions(DatabaseAction.add, transaction);
            } else if (hasProducts && existingProcessing) {
                // Update the existing PROCESSING transaction with current products
                processingTxCreatedDateRef.current = existingProcessing.createdDate;
                existingProcessing.products = products.current.map((p) => ({ ...p }));
                existingProcessing.amount = getCustomerTotal();
                if (liveShare > 0) {
                    existingProcessing.employerShare = liveShare;
                } else {
                    delete existingProcessing.employerShare;
                }
                const existingCustomerName = currentCustomer
                    ? `${currentCustomer.firstName} ${currentCustomer.lastName}`.trim() || undefined
                    : undefined;
                if (existingCustomerName) {
                    existingProcessing.customerName = existingCustomerName;
                } else {
                    delete existingProcessing.customerName;
                }
                existingProcessing.modifiedDate = floorToSeconds(new Date().getTime());
                storeTransaction(existingProcessing);
                saveTransactions(DatabaseAction.sync, existingProcessing);
            }
        }, 500);
    }, [
        transactions,
        parameters.user,
        currencies,
        currencyIndex,
        getCustomerTotal,
        getEmployerShare,
        storeTransaction,
        saveTransactions,
        currentCustomer,
    ]);
    saveProcessingTransactionRef.current = saveProcessingTransaction;

    const editTransaction = useCallback(
        (index: number, override?: Transaction): boolean => {
            if (isLocked) return false;
            const transaction = override ?? transactions.at(index);
            if (!transaction?.amount) return false;

            // Refuse to edit a PROCESSING transaction that does not belong to this device.
            if (isProcessingTransaction(transaction)) {
                const currentDeviceId = getPublicKey();
                if (transaction.deviceId !== currentDeviceId) return false;
            }

            // A sealed confirmed transaction can never be modified — refuse
            // before the local mutation so the edit can't diverge from the
            // ledger. Sealed drafts stay editable: paying them lands as a
            // re-dated new transaction.
            const sealedDay = sealedTxDay(transaction);
            if (sealedDay && isConfirmedTransaction(transaction)) {
                openFullscreenPopup(
                    `Journée du ${sealedDay} clôturée — modification impossible, émettez un avoir daté du jour`,
                    ['OK']
                );
                return false;
            }

            // Track if this tx was WAITING — the kitchen already received a ticket when it was put on hold.
            wasWaitingBeforeEditRef.current = isWaitingTransaction(transaction);
            // Snapshot the original products to compute the delta when the tx is committed
            originalProductsSnapshotRef.current = transaction.products.map((p) => ({ ...p }));

            setCurrency(transaction.currency);
            suppressAutoSaveRef.current = true;
            transaction.products.forEach(addProduct);
            suppressAutoSaveRef.current = false;
            transaction.method = PROCESSING_KEYWORD;
            processingTxCreatedDateRef.current = transaction.createdDate;

            saveTransactions(DatabaseAction.update, transaction);
            return true;
        },
        [transactions, saveTransactions, addProduct, setCurrency, isLocked, sealedTxDay, openFullscreenPopup]
    );

    const updateTransaction = useCallback(
        (item: string | Transaction) => {
            if (isLocked) return;
            if (!item || (typeof item === 'string' && !products.current.length)) return;

            const currentTime = floorToSeconds(new Date().getTime()); // floor to seconds to match SQL TIMESTAMP precision
            const liveShare = getEmployerShare();
            // When paying, find the existing PROCESSING transaction to update.
            // transactionId.current may be 0 because saveTransactions resets it to 0 after an 'add'
            // (which is what saveProcessingTransaction uses). Fall back to looking up the PROCESSING
            // tx by validator so we can reuse its createdDate — this makes the PAID tx replace the
            // PROCESSING tx (same createdDate) instead of creating a duplicate row in the DB.
            const currentDeviceId = getPublicKey();
            const existingTransaction = transactionId.current
                ? transactions.find((tx) => tx.createdDate === transactionId.current)
                : transactions.find((t) => isProcessingTransaction(t) && t.deviceId === currentDeviceId);

            const transaction: Transaction =
                typeof item === 'object'
                    ? {
                          ...item,
                          deviceId: item.deviceId ?? existingTransaction?.deviceId ?? currentDeviceId,
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
                          deviceId: existingTransaction?.deviceId ?? currentDeviceId,
                          ...(liveShare > 0 ? { employerShare: liveShare } : {}),
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
            getEmployerShare,
            isLocked,
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
                ...(transaction.employerShare ? { employerShare: -transaction.employerShare } : {}),
                ...(transaction.fidelityPointsUsed ? { fidelityPointsUsed: -transaction.fidelityPointsUsed } : {}),
            };
        },
        [computeQuantity]
    );

    // Create a new REFUND tx from an existing tx, without loading products or mutating the original.
    // The original tx stays unchanged; a new tx with reversed products is added to the list.
    // Returns the created refund tx so the caller can print it.
    const refundTransaction = useCallback(
        (index: number): Transaction | undefined => {
            if (isLocked) return undefined;
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
        [transactions, reverseTransaction, storeTransaction, saveTransactions, isLocked]
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
                getEmployerShare,
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
                companies,
                wasWaitingBeforeEditRef,
                originalProductsSnapshotRef,
                transactionsLoaded,
                isCashClosed: isLocked,
                subscriptionStopped,
                setCashClosed,
                getEffectiveStock,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
