'use client';

import { initializeApp } from 'firebase/app';
import {
    Firestore,
    collection,
    deleteField,
    doc,
    getDocs,
    getFirestore,
    onSnapshot,
    query,
    setDoc,
    updateDoc,
    where,
} from 'firebase/firestore';
import { ChangeEvent, FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { DataContext } from '../hooks/useData';
import { useWindowParam } from '../hooks/useWindowParam';
import {
    DELETED_KEYWORD,
    IS_DEV,
    OTHER_KEYWORD,
    PROCESSING_KEYWORD,
    REFUND_KEYWORD,
    TRANSACTIONS_KEYWORD,
    UPDATING_KEYWORD,
    WAITING_KEYWORD,
} from '../utils/constants';
import { getFormattedDate, getTransactionFileName, toSQLDateTime } from '../utils/date';
import {
    Currency,
    Discount,
    OrderData,
    OrderItem,
    Product,
    SyncAction,
    SyncPeriod,
    Transaction,
    TransactionSet,
} from '../utils/interfaces';
import { isDeletedTransaction, isProcessingTransaction, isWaitingTransaction } from './dataProvider/transactionHelpers';
import { useMercurial } from './dataProvider/useMercurial';

enum DatabaseAction {
    add,
    update,
    delete,
}

enum ConvertAction {
    none,
    cloud,
    local,
    both,
}

export interface DataProviderProps {
    children: ReactNode;
}

export const DataProvider: FC<DataProviderProps> = ({ children }) => {
    const { currencies, currencyIndex, setCurrency, parameters } = useConfig();
    const { isDemo, isOnline } = useWindowParam();

    const [transactionsFilename, setTransactionsFilename] = useState('');
    const [total, setTotal] = useState(0);
    const [amount, setAmount] = useState(0);
    const [quantity, setQuantity] = useState(0);
    const [currentMercurial, setCurrentMercurial] = useState(parameters.mercurial);
    const [selectedProduct, setSelectedProduct] = useState<Product>();
    const products = useRef<Product[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const transactionId = useRef(0);
    const [firestore, setFirestore] = useState<Firestore>();
    const areTransactionLoaded = useRef(false);
    const [shopId, setShopId] = useState('');
    const [orderId, setOrderId] = useState('');
    const [orderData, setOrderData] = useState<OrderData | null>(null);
    const [selectedOrderItems, setSelectedOrderItems] = useState<OrderItem[]>([]);
    const [partialPaymentAmount, setPartialPaymentAmount] = useState(0);
    const [showPartialPaymentSelector, setShowPartialPaymentSelector] = useState(false);

    const isDbConnected = useMemo(() => !!firestore && isOnline, [firestore, isOnline]);

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
            console.log('SQL DB transactions loaded successfully:', data.transactions?.length || 0);
            return data.transactions as Transaction[];
        } catch (error) {
            console.error('Error loading transactions from SQL DB:', error);
            return null;
        }
    }, []);

    const getLocalTransactions = useCallback(() => {
        const localTransactionSets: TransactionSet[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.includes(shopId || TRANSACTIONS_KEYWORD)) {
                const value = localStorage.getItem(key);
                if (value) {
                    const transactions = JSON.parse(value) as Transaction[];
                    localTransactionSets.push({ id: key, transactions });
                }
            }
        }
        return localTransactionSets.sort((a, b) => a.id.localeCompare(b.id));
    }, [shopId]);

    const setLocalStorageItem = useCallback(
        (key: string, transactions: Transaction[]) => {
            try {
                localStorage.setItem(key, JSON.stringify(transactions));
            } catch {
                const localTransactionSets = getLocalTransactions();
                localStorage.removeItem(localTransactionSets[0].id);
                setLocalStorageItem(key, transactions);
            }
        },
        [getLocalTransactions]
    );

    const mergeTransactionArrays = useCallback((local: Transaction[], remote: Transaction[]): Transaction[] => {
        const merged = [...local];
        for (const remoteTx of remote) {
            const localIndex = merged.findIndex((tx) => tx.createdDate === remoteTx.createdDate);
            if (localIndex === -1) {
                // Remote-only transaction → add it
                merged.push(remoteTx);
            } else if (remoteTx.modifiedDate > merged[localIndex].modifiedDate) {
                // Both exist → keep the latest
                merged[localIndex] = remoteTx;
            }
        }
        return merged;
    }, []);

    useEffect(() => {
        if (!parameters.shop.name || areTransactionLoaded.current) return;

        const shopId = window.location.pathname.split('/')[1];
        setShopId(shopId);

        const filename = getTransactionFileName(shopId);

        const loadTransactions = async () => {
            // Always load from localStorage first to avoid data loss
            const localTransactions = JSON.parse(localStorage.getItem(filename) || '[]') as Transaction[];

            // If SQL DB is enabled, merge SQL data into local (latest modifiedDate wins)
            if (process.env.NEXT_PUBLIC_USE_SQLDB) {
                const sqlTransactions = await loadTransactionsFromSQL();
                if (sqlTransactions?.length) {
                    const merged = mergeTransactionArrays(localTransactions, sqlTransactions);
                    const mergedNonDeleted = merged.filter((tx) => !isDeletedTransaction(tx));
                    setLocalStorageItem(filename, mergedNonDeleted);
                    setTransactions(merged);
                    areTransactionLoaded.current = true;
                    setTransactionsFilename(filename);
                    console.log(
                        'Merged transactions: local=',
                        localTransactions.length,
                        'sql=',
                        sqlTransactions.length,
                        'result=',
                        merged.length
                    );
                    return;
                }
            }

            setTransactions(localTransactions);
            areTransactionLoaded.current = true;
            setTransactionsFilename(filename);
        };

        loadTransactions();
    }, [parameters.shop.name, loadTransactionsFromSQL, mergeTransactionArrays, setLocalStorageItem]);

    // Compute next reset timestamp based on closingHour
    const getNextResetTime = useCallback(() => {
        const now = new Date();
        const reset = new Date();
        reset.setHours(parameters.closingHour, 0, 0, 0);
        // If we're already past today's closing hour, schedule for tomorrow
        if (now >= reset) reset.setDate(reset.getDate() + 1);
        return reset.getTime();
    }, [parameters.closingHour]);

    const performDayReset = useCallback(() => {
        if (!areTransactionLoaded.current) return; // Already resetting
        areTransactionLoaded.current = false;
        setTransactionsFilename('');
        nextResetTime.current = getNextResetTime();
    }, [getNextResetTime]);

    const nextResetTime = useRef(0);

    // Day reset: setTimeout (primary) + setInterval + visibilitychange (backups)
    useEffect(() => {
        if (!parameters.shop.name) return;

        nextResetTime.current = getNextResetTime();

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
    }, [parameters.shop.name, getNextResetTime, performDayReset]);

    useEffect(() => {
        if (IS_DEV || isDemo) return;

        fetch(`./api/firebase`)
            .catch((error) => {
                console.error(error);
            })
            .then((response) => {
                if (typeof response === 'undefined') return;
                response.json().then((options) => {
                    if (!options) return;
                    const firebaseApp = initializeApp(options);
                    const firebaseFirestore = getFirestore(firebaseApp);
                    setFirestore(firebaseFirestore);
                });
            });
    }, [isDemo]);

    const storeIndex = useCallback(
        async (id: string) => {
            if (!firestore) return;

            const info = id.split('_');
            await setDoc(doc(firestore, 'Indexes', id), {
                shop: !info[0].startsWith(TRANSACTIONS_KEYWORD) ? info[0] : '',
                date: new Date(info[1]).getTime(),
            });
        },
        [firestore]
    );

    const storeTransaction = useCallback(
        (transaction: Transaction) => {
            const isDeleted = isDeletedTransaction(transaction);
            const index = transactions.findIndex(({ createdDate }) => createdDate === transaction.createdDate);
            if (!isDeleted) {
                if (index >= 0) transactions.splice(index, 1, transaction);
                else transactions.unshift(transaction);
            } else if (index >= 0) transactions.splice(index, 1);

            setTransactions([...transactions]);
        },
        [transactions, setTransactions]
    );

    const convertTransactionsData = useCallback(
        (convertAction = ConvertAction.none) => {
            // CONVERT CLOUD TRANSACTIONS
            if (convertAction === ConvertAction.cloud || convertAction === ConvertAction.both) {
                if (!firestore) return;
                getDocs(collection(firestore, 'Indexes')).then((querySnapshot) => {
                    querySnapshot.forEach(async (document) => {
                        const colId = document.id;
                        await storeIndex(colId);

                        getDocs(collection(firestore, colId)).then((query) => {
                            query.forEach(async (document) => {
                                const id = document.id;
                                await updateDoc(doc(firestore, colId, id), {
                                    shop: deleteField(),
                                });
                            });
                        });
                    });
                });
            }

            // CONVERT LOCAL TRANSACTIONS
            if (convertAction === ConvertAction.local || convertAction === ConvertAction.both) {
                const localTransactionSets = getLocalTransactions();
                localTransactionSets.forEach((localTransactionSet) => {
                    let id = localTransactionSet.id;
                    const tx = localTransactionSet.transactions.map((transaction) => {
                        return {
                            validator: transaction.validator,
                            method: transaction.method,
                            amount: transaction.amount,
                            createdDate: transaction.createdDate,
                            modifiedDate: transaction.modifiedDate,
                            currency:
                                typeof transaction.currency === 'string'
                                    ? transaction.currency
                                    : (transaction.currency as Currency).label,
                            products: transaction.products,
                        };
                    });
                    if (id.includes('+')) {
                        localStorage.removeItem(id);
                        id = id.split('+')[1];
                    }
                    setLocalStorageItem(id, tx);
                });
            }

            return convertAction === ConvertAction.cloud || convertAction === ConvertAction.both;
        },
        [firestore, storeIndex, getLocalTransactions, setLocalStorageItem]
    );

    const updateLocalTransaction = useCallback(
        (transactionSet: TransactionSet) => {
            const txToUpdate = transactionSet.transactions.filter(
                (transaction) => !isProcessingTransaction(transaction)
            );
            if (txToUpdate.length) {
                const txToLocalStorage = txToUpdate.filter((tx) => !isDeletedTransaction(tx));
                if (txToLocalStorage.length) {
                    setLocalStorageItem(transactionSet.id, txToLocalStorage);
                } else {
                    localStorage.removeItem(transactionSet.id);
                }
            }
            txToUpdate
                .filter((tx) => new Date(tx.createdDate).toLocaleDateString() === new Date().toLocaleDateString())
                .forEach((tx) => storeTransaction(tx));
        },
        [setLocalStorageItem, storeTransaction]
    );
    const updateCloudTransaction = useCallback(
        async (id: string, transaction: Transaction) => {
            if (!firestore) return;
            await setDoc(doc(firestore, id, transaction.createdDate.toString()), transaction);
        },
        [firestore]
    );

    // Check if the "transaction set" in the cloud exists in local (check by "id").
    // If not add it, if yes, check if every transaction in the cloud transaction set exist in local (check by "createdDate").
    // If not, add the transaction, if yes, check which one has the biggest "modifiedDate".
    // If it's the cloud one, update the local, if it's the local one, update the cloud.
    // Then, check if the "transaction set" in local exists in the cloud, using the same method as above.
    const fullSync = useCallback(
        async (cloudTransactionSets: TransactionSet[], syncPeriod: SyncPeriod) => {
            let localTransactionSets = getLocalTransactions();

            console.log(
                'syncTransactions',
                'cloud',
                cloudTransactionSets.sort((a, b) => a.id.localeCompare(b.id)),
                'local',
                localTransactionSets.sort((a, b) => a.id.localeCompare(b.id))
            );

            // Merge cloud → local
            for (const cloudTransactionSet of cloudTransactionSets) {
                const localTransactionSet = localTransactionSets.find((set) => set.id === cloudTransactionSet.id);

                if (!localTransactionSet) {
                    console.log('Added set to local', cloudTransactionSet.id);
                    updateLocalTransaction(cloudTransactionSet);
                } else {
                    const updateTransactionSet: TransactionSet = {
                        id: localTransactionSet.id,
                        transactions: [...localTransactionSet.transactions],
                    };
                    for (const cloudTransaction of cloudTransactionSet.transactions) {
                        const index = localTransactionSet.transactions.findIndex(
                            (localTransaction) => localTransaction.createdDate === cloudTransaction.createdDate
                        );

                        if (index === -1) {
                            console.log('Added transaction to local', cloudTransaction);
                            updateTransactionSet.transactions.push(cloudTransaction);
                        } else if (localTransactionSet.id === transactionsFilename) {
                            const localTransaction = localTransactionSet.transactions[index];

                            if (cloudTransaction.modifiedDate > localTransaction.modifiedDate) {
                                console.log('Updated transaction in local', cloudTransaction);
                                updateTransactionSet.transactions.splice(index, 1, cloudTransaction);
                            } else if (firestore && cloudTransaction.modifiedDate < localTransaction.modifiedDate) {
                                console.log('Updated transaction in cloud', localTransaction);
                                await updateCloudTransaction(cloudTransactionSet.id, localTransaction);
                            }
                        }
                    }
                    updateLocalTransaction(updateTransactionSet);
                }
            }

            // Merge local → cloud (full sync only, requires Firebase)
            if (syncPeriod === SyncPeriod.full && firestore) {
                localTransactionSets = getLocalTransactions(); // Update local transaction sets after cloud sync
                for (const localTransactionSet of localTransactionSets) {
                    const cloudTransactionSet = cloudTransactionSets.find((set) => set.id === localTransactionSet.id);

                    if (!cloudTransactionSet) {
                        console.log('Added set to cloud', localTransactionSet.id);
                        await storeIndex(localTransactionSet.id);
                        for (const localTransaction of localTransactionSet.transactions) {
                            await updateCloudTransaction(localTransactionSet.id, localTransaction);
                        }
                    } else {
                        for (const localTransaction of localTransactionSet.transactions) {
                            if (
                                !cloudTransactionSet.transactions.some(
                                    (cloudTransaction) => cloudTransaction.createdDate === localTransaction.createdDate
                                )
                            ) {
                                console.log('Added transaction to cloud', localTransaction);
                                await updateCloudTransaction(localTransactionSet.id, localTransaction);
                            }
                        }
                    }
                }
            }
        },
        [
            firestore,
            storeIndex,
            getLocalTransactions,
            transactionsFilename,
            updateLocalTransaction,
            updateCloudTransaction,
        ]
    );

    const processSyncFromSQL = useCallback(
        async (syncPeriod: SyncPeriod) => {
            try {
                // For SQL DB, we load all transactions and let fullSync handle them
                const response = await fetch(
                    `/api/sql/getTransactions?period=${syncPeriod === SyncPeriod.day ? 'day' : 'full'}&date=${new Date().toISOString().split('T')[0]}`
                );
                if (!response.ok) {
                    console.error('SQL DB sync error:', await response.json());
                    return;
                }
                const data = await response.json();
                const sqlTransactions = data.transactions as Transaction[];

                if (sqlTransactions.length) {
                    const cloudTransactionSets: TransactionSet[] = [
                        {
                            id: transactionsFilename,
                            transactions: sqlTransactions,
                        },
                    ];
                    fullSync(cloudTransactionSets, syncPeriod);
                }
                console.log('SQL DB sync completed:', sqlTransactions.length, 'transactions');
            } catch (error) {
                console.error('Error syncing from SQL DB:', error);
            }
        },
        [fullSync, transactionsFilename]
    );

    const processSync = useCallback(
        (ids: string | string[], syncPeriod: SyncPeriod) => {
            // Use SQL DB if enabled
            if (process.env.NEXT_PUBLIC_USE_SQLDB) {
                processSyncFromSQL(syncPeriod);
                return;
            }

            if (!firestore) return;

            const collectionIds = Array.isArray(ids) ? ids : [ids];
            let txToProcess = collectionIds.length;
            console.log('Loaded all collections:', txToProcess);

            const cloudTransactionSets: TransactionSet[] = [];
            collectionIds.forEach((id) => {
                getDocs(collection(firestore, id)).then((query) => {
                    const transactions = query.docs.map((doc) => doc.data() as Transaction);
                    if (transactions.length) cloudTransactionSets.push({ id, transactions });

                    console.log('Collections to process:', txToProcess);

                    if (!--txToProcess) {
                        fullSync(cloudTransactionSets, syncPeriod);
                    }
                });
            });
        },
        [firestore, fullSync, processSyncFromSQL]
    );

    const syncTransactions = useCallback(
        (period: SyncPeriod, filename = transactionsFilename) => {
            // For SQL DB, directly use processSync which handles SQL logic
            if (process.env.NEXT_PUBLIC_USE_SQLDB) {
                if (!filename || convertTransactionsData(ConvertAction.local)) return;
                processSync(filename, period);
                return;
            }

            if (!firestore || !filename || convertTransactionsData(ConvertAction.local)) return;

            if (period === SyncPeriod.day) {
                processSync(filename, period);
            } else {
                getDocs(query(collection(firestore, 'Indexes'), where('shop', '==', shopId))).then((querySnapshot) => {
                    processSync(
                        querySnapshot.docs.map((doc) => doc.id),
                        period
                    );
                });
            }
        },
        [convertTransactionsData, firestore, processSync, shopId, transactionsFilename]
    );

    useEffect(() => {
        // For SQL DB mode, only sync transactions without Firebase real-time listener
        if (process.env.NEXT_PUBLIC_USE_SQLDB) {
            if (!transactionsFilename) return;
            syncTransactions(SyncPeriod.day);
            return;
        }

        if (!firestore || !transactionsFilename) return;

        syncTransactions(SyncPeriod.day); // Synchronize the daily transactions on the first load

        const q = query(collection(firestore, transactionsFilename));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            querySnapshot.docChanges().forEach((change) => {
                // change type can be 'added', 'modified', or 'deleted'
                const tx = change.doc.data() as Transaction;
                console.log(change.type, tx);

                const localTx = transactions.find((transaction) => transaction.createdDate === tx.createdDate);

                const txToUpdate = [...transactions];
                const updateTx = (txToUpdate: Transaction[]) =>
                    updateLocalTransaction({ id: transactionsFilename, transactions: txToUpdate });
                if (!localTx) {
                    txToUpdate.push(tx as Transaction);
                    updateTx(txToUpdate);
                } else {
                    // TODO : check the transactions modifiedDate
                    txToUpdate.splice(
                        txToUpdate.findIndex((transaction) => transaction.createdDate === tx.createdDate),
                        1,
                        {
                            ...tx,
                            method:
                                isProcessingTransaction(tx) && !transactionId.current ? UPDATING_KEYWORD : tx.method,
                        }
                    );
                    updateTx(txToUpdate);
                }
            });
        });

        return () => unsubscribe();
    }, [firestore, transactionsFilename]); // eslint-disable-line react-hooks/exhaustive-deps

    const exportTransactions = useCallback(() => {
        const localTransactionSets = getLocalTransactions();
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
        (syncAction: SyncAction, date?: Date, event?: ChangeEvent<HTMLInputElement>) => {
            // Allow processing with SQL DB or Firebase
            if (!firestore && !process.env.NEXT_PUBLIC_USE_SQLDB) return;

            const filename = date ? getTransactionFileName(shopId, date) : transactionsFilename;
            switch (syncAction) {
                case SyncAction.fullsync:
                    syncTransactions(SyncPeriod.full);
                    break;
                case SyncAction.daysync:
                    syncTransactions(SyncPeriod.day, filename);
                    break;
                case SyncAction.resync:
                    localStorage.removeItem(filename);
                    syncTransactions(SyncPeriod.day, filename);
                    break;
                case SyncAction.export:
                    exportTransactions();
                    break;
                case SyncAction.import:
                    importTransactions(event);
                    break;
            }
        },
        [firestore, syncTransactions, exportTransactions, importTransactions, shopId, transactionsFilename]
    );

    const saveTransactions = useCallback(
        async (action: DatabaseAction, transaction: Transaction) => {
            if (!transaction) return;

            transaction.modifiedDate = transaction.modifiedDate ? new Date().getTime() : transaction.createdDate;
            transaction.amount = transaction.amount.clean(
                currencies.find(({ label }) => label === transaction.currency)?.decimals
            );
            transaction.validator = parameters.user.name;

            if (transactions.length) {
                setLocalStorageItem(transactionsFilename, transactions);
            } else {
                localStorage.removeItem(transactionsFilename);
            }

            const index = transaction.createdDate;
            transactionId.current = action === DatabaseAction.update ? index : 0;

            if (firestore) {
                switch (action) {
                    case DatabaseAction.add:
                        await storeIndex(transactionsFilename);
                        await setDoc(doc(firestore, transactionsFilename, index.toString()), transaction);
                        break;
                    case DatabaseAction.update:
                        await updateDoc(doc(firestore, transactionsFilename, index.toString()), {
                            method: PROCESSING_KEYWORD,
                        });
                        break;
                    case DatabaseAction.delete:
                        await updateDoc(doc(firestore, transactionsFilename, index.toString()), {
                            method: DELETED_KEYWORD,
                        });
                        break;
                }
            }

            if (process.env.NEXT_PUBLIC_USE_SQLDB) {
                try {
                    // Prepare the transaction data for SQL DB
                    const sqlTransactionData = {
                        action: DatabaseAction[action],
                        transaction: {
                            id: index,
                            panier_id: orderId || String(transaction.createdDate).slice(0, 10),
                            user_id: transaction.validator,
                            payment_method_id: transaction.method,
                            amount: transaction.amount,
                            currency: transaction.currency,
                            note: '',
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
                        transaction.method !== WAITING_KEYWORD &&
                        transaction.method !== REFUND_KEYWORD &&
                        transaction.method !== DELETED_KEYWORD &&
                        transaction.method !== PROCESSING_KEYWORD &&
                        transaction.method !== UPDATING_KEYWORD;

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
            firestore,
            setLocalStorageItem,
            currencies,
            storeIndex,
            orderId,
        ]
    );

    const deleteTransaction = useCallback(
        (index?: number) => {
            if (!transactions.length) return;

            index = index ?? transactions.findIndex(({ createdDate }) => createdDate === transactionId.current);

            if (index >= 0) {
                const transaction = transactions[index];
                transaction.method = DELETED_KEYWORD;
                storeTransaction(transaction);
                saveTransactions(DatabaseAction.delete, transaction);
            }
        },
        [transactions, saveTransactions, storeTransaction]
    );

    const toCurrency = useCallback(
        (element: { amount: number; currency?: string } | number | Product | Transaction) => {
            const currency =
                (typeof element !== 'number' && element.hasOwnProperty('currency')
                    ? currencies.find(({ label }) => label === (element as { currency: string }).currency)
                    : undefined) ?? currencies[currencyIndex];
            const amount = element.hasOwnProperty('amount')
                ? (element as { amount: number }).amount
                : (element as number);
            return amount.toCurrency(currency.decimals, currency.symbol);
        },
        [currencies, currencyIndex]
    );

    const { toMercurial, fromMercurial } = useMercurial(currentMercurial);

    const getCurrentTotal = useCallback(() => {
        return products.current ? products.current.reduce((t, { total }) => t + (total ?? 0), 0) : 0;
    }, [products]);

    const updateTotal = useCallback(() => {
        setTotal(getCurrentTotal());
    }, [getCurrentTotal]);

    const clearAmount = useCallback(() => {
        setAmount(0);
        setQuantity(0);
        setCurrentMercurial(parameters.mercurial);
        setSelectedProduct(undefined);
        updateTotal();
    }, [updateTotal, parameters.mercurial]);

    const clearTotal = useCallback(() => {
        products.current = [];
        deleteTransaction();
        clearAmount();
    }, [clearAmount, deleteTransaction]);

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
                ({ label, category, amount }) =>
                    label === product.label && category === product.category && amount === product.amount
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
        },
        [products, selectedProduct, computeQuantity]
    );

    const deleteProduct = useCallback(
        (index: number) => {
            if (!products.current.length || !products.current.at(index)) return;

            products.current.splice(index, 1).at(0);

            if (!products.current.length) {
                deleteTransaction();
            }

            clearAmount();
        },
        [products, clearAmount, deleteTransaction]
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
            return (
                (product.label && product.label !== OTHER_KEYWORD ? product.label : product.category) +
                ' : ' +
                toCurrency({ amount: product.amount, currency: currency }) +
                ' x ' +
                product.quantity +
                ' = ' +
                toCurrency({ amount: product.total ?? 0, currency: currency }) +
                (product.discount.amount ? ' (-' + product.discount.amount + product.discount.unit + ')' : '')
            );
        },
        [toCurrency]
    );

    useEffect(() => {
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

    const editTransaction = useCallback(
        (index: number) => {
            const transaction = transactions.at(index);
            if (!transaction?.amount) return;

            setCurrency(transaction.currency);
            transaction.products.forEach(addProduct);
            transaction.method = PROCESSING_KEYWORD;

            saveTransactions(DatabaseAction.update, transaction);
        },
        [transactions, saveTransactions, addProduct, setCurrency]
    );

    const updateTransaction = useCallback(
        (item: string | Transaction) => {
            if (!item || (typeof item === 'string' && !products.current.length)) return;

            const currentTime = new Date().getTime();
            const transaction: Transaction =
                typeof item === 'object'
                    ? item
                    : {
                          validator: parameters.user.name,
                          method: item,
                          amount: getCurrentTotal(),
                          createdDate: transactionId.current || currentTime,
                          modifiedDate: transactionId.current,
                          currency: currencies[currencyIndex].label,
                          products: products.current,
                      };

            storeTransaction(transaction);
            saveTransactions(DatabaseAction.add, transaction);

            clearTotal();
        },
        [
            clearTotal,
            products,
            saveTransactions,
            getCurrentTotal,
            currencies,
            currencyIndex,
            storeTransaction,
            parameters,
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

    const displayTransaction = useCallback(
        (transaction: Transaction) => {
            return transaction.modifiedDate && transaction.method
                ? toCurrency(transaction) +
                      (isWaitingTransaction(transaction) ? ' ' : ' en ') +
                      transaction.method +
                      ' à ' +
                      new Date(transaction.modifiedDate).toTimeString().slice(0, 9)
                : '';
        },
        [toCurrency]
    );

    return (
        <DataContext.Provider
            value={{
                total,
                getCurrentTotal,
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
                updateTransaction,
                editTransaction,
                deleteTransaction,
                displayTransaction,
                reverseTransaction,
                transactionsFilename,
                toCurrency,
                isDbConnected,
                orderId,
                setOrderId,
                orderData,
                setOrderData,
                selectedOrderItems,
                setSelectedOrderItems,
                partialPaymentAmount,
                setPartialPaymentAmount,
                showPartialPaymentSelector,
                setShowPartialPaymentSelector,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
