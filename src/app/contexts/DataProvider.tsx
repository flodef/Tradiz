'use client';

import { initializeApp } from 'firebase/app';
import {
    Firestore,
    collection,
    deleteDoc,
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
import { Currency, Discount, Mercurial, useConfig } from '../hooks/useConfig';
import { DataContext, Product, SyncAction, SyncPeriod, Transaction, TransactionSet } from '../hooks/useData';
import { useWindowParam } from '../hooks/useWindowParam';
import {
    DELETED_KEYWORD,
    GET_FORMATTED_DATE,
    IS_DEV,
    OTHER_KEYWORD,
    PROCESSING_KEYWORD,
    TRANSACTIONS_KEYWORD,
    WAITING_KEYWORD,
} from '../utils/constants';

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

    const isDbConnected = useMemo(() => !!firestore && isOnline, [firestore, isOnline]);

    useEffect(() => {
        setCurrentMercurial(parameters.mercurial);
    }, [parameters.mercurial]);

    useEffect(() => {
        if (!parameters.shopName || areTransactionLoaded.current) return;

        const shopId = window.location.pathname.split('/')[1];
        setShopId(shopId);

        const filename = (shopId || TRANSACTIONS_KEYWORD) + '_' + GET_FORMATTED_DATE();

        const transactions = JSON.parse(localStorage.getItem(filename) || '[]') as Transaction[];
        setTransactions(transactions);
        areTransactionLoaded.current = true;
        setTransactionsFilename(filename);

        const now = new Date();
        const midnight = new Date();
        midnight.setDate(now.getDate() + 1);
        midnight.setHours(0, 0, 0, 0);
        const timeUntilMidnight = midnight.getTime() - now.getTime();
        setTimeout(() => {
            areTransactionLoaded.current = false;
            setTransactionsFilename('');
        }, timeUntilMidnight); // Automatically reload at midnight
    }, [parameters.shopName]);

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

    const isWaitingTransaction = useCallback((transaction?: Transaction) => {
        return Boolean(transaction && transaction.method === WAITING_KEYWORD);
    }, []);
    const isProcessingTransaction = useCallback((transaction?: Transaction) => {
        return Boolean(transaction && transaction.method === PROCESSING_KEYWORD);
    }, []);
    const isDeletedTransaction = useCallback((transaction?: Transaction) => {
        return Boolean(transaction && transaction.method === DELETED_KEYWORD);
    }, []);

    const storeIndex = useCallback(
        async (id: string) => {
            if (!firestore) return;

            const info = id.split('_');
            await setDoc(doc(firestore, 'Indexes', id), { shop: info[0], date: new Date(info[1]).getTime() });
        },
        [firestore]
    );

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
            } catch (error) {
                const localTransactionSets = getLocalTransactions();
                localStorage.removeItem(localTransactionSets[0].id);
                setLocalStorageItem(key, transactions);
            }
        },
        [getLocalTransactions]
    );

    const storeTransaction = useCallback(
        (transaction: Transaction) => {
            const isDeleted = isDeletedTransaction(transaction);
            const index = transactions.findIndex(({ createdDate }) => createdDate === transaction.createdDate);
            if (!isDeleted) {
                if (index >= 0) {
                    transactions.splice(index, 1, transaction);
                } else {
                    transactions.unshift(transaction);
                }
            } else if (index >= 0) {
                transactions.splice(index, 1);
            }

            setTransactions(
                transactions.toSorted((a, b) => (isWaitingTransaction(a) && !isWaitingTransaction(b) ? -1 : 1))
            ); // Put the waiting transaction at the beginning of the list
        },
        [isWaitingTransaction, transactions, setTransactions, isDeletedTransaction]
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

    // Check if the "transaction set" in the cloud exists in local (check by "id").
    // If not add it, if yes, check if every transaction in the cloud transaction set exist in local (check by "createdDate").
    // If not, add the transaction, if yes, check which one has the biggest "modifiedDate".
    // If it's the cloud one, update the local, if it's the local one, update the cloud.
    // Then, check if the "transaction set" in local exists in the cloud, using the same method as above.
    const fullSync = useCallback(
        (cloudTransactionSets: TransactionSet[], syncPeriod: SyncPeriod) => {
            if (!firestore) return;

            let localTransactionSets = getLocalTransactions();

            console.log(
                'syncTransactions',
                'cloud',
                cloudTransactionSets.sort((a, b) => a.id.localeCompare(b.id)),
                'local',
                localTransactionSets.sort((a, b) => a.id.localeCompare(b.id))
            );

            const updateLocalTransaction = (transactionSet: TransactionSet) => {
                const txToUpdate = transactionSet.transactions.filter(
                    (transaction) => !isProcessingTransaction(transaction)
                );
                if (txToUpdate.length) {
                    setLocalStorageItem(
                        transactionSet.id,
                        txToUpdate.filter((tx) => !isDeletedTransaction(tx))
                    );
                }
                txToUpdate
                    .filter((tx) => new Date(tx.createdDate).toLocaleDateString() === new Date().toLocaleDateString())
                    .forEach((tx) => storeTransaction(tx));
            };
            const updateCloudTransaction = async (id: string, transaction: Transaction) => {
                await setDoc(doc(firestore, id, transaction.createdDate.toString()), transaction);
            };

            cloudTransactionSets.forEach((cloudTransactionSet) => {
                const localTransactionSet = localTransactionSets.find((set) => set.id === cloudTransactionSet.id);

                if (!localTransactionSet) {
                    console.log('Added set to local', cloudTransactionSet.id);
                    updateLocalTransaction(cloudTransactionSet);
                } else {
                    const updateTransactionSet: TransactionSet = {
                        id: localTransactionSet.id,
                        transactions: [...localTransactionSet.transactions],
                    };
                    cloudTransactionSet.transactions.forEach(async (cloudTransaction) => {
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
                            } else if (cloudTransaction.modifiedDate < localTransaction.modifiedDate) {
                                console.log('Updated transaction in cloud', localTransaction);
                                await updateCloudTransaction(cloudTransactionSet.id, localTransaction);
                            }
                        }
                    });
                    updateLocalTransaction(updateTransactionSet);
                }
            });

            if (syncPeriod === SyncPeriod.full) {
                localTransactionSets = getLocalTransactions(); // Update local transaction sets after cloud sync
                localTransactionSets.forEach(async (localTransactionSet) => {
                    const cloudTransactionSet = cloudTransactionSets.find((set) => set.id === localTransactionSet.id);

                    if (!cloudTransactionSet) {
                        console.log('Added set to cloud', localTransactionSet.id);
                        await storeIndex(localTransactionSet.id);
                        localTransactionSet.transactions.forEach(
                            async (localTransaction) =>
                                await updateCloudTransaction(localTransactionSet.id, localTransaction)
                        );
                    } else {
                        localTransactionSet.transactions.forEach(async (localTransaction) => {
                            if (
                                !cloudTransactionSet.transactions.some(
                                    (cloudTransaction) => cloudTransaction.createdDate === localTransaction.createdDate
                                )
                            ) {
                                console.log('Added transaction to cloud', localTransaction);
                                await updateCloudTransaction(localTransactionSet.id, localTransaction);
                            }
                        });
                    }
                });
            }
        },
        [
            firestore,
            storeTransaction,
            isProcessingTransaction,
            isDeletedTransaction,
            setLocalStorageItem,
            storeIndex,
            getLocalTransactions,
            transactionsFilename,
        ]
    );

    const processSync = useCallback(
        (ids: string | string[], syncPeriod: SyncPeriod) => {
            if (!firestore) return;

            const collectionIds = Array.isArray(ids) ? ids : [ids];
            let txToProcess = collectionIds.length;
            console.log('Loaded all collections:', txToProcess);

            const cloudTransactionSets: TransactionSet[] = [];
            collectionIds.forEach((id) => {
                getDocs(collection(firestore, id)).then((query) => {
                    const transactions = query.docs.map((doc) => doc.data() as Transaction);
                    cloudTransactionSets.push({ id, transactions });

                    console.log('Collections to process:', txToProcess);

                    if (!--txToProcess) {
                        fullSync(cloudTransactionSets, syncPeriod);
                    }
                });
            });
        },
        [firestore, fullSync]
    );

    const syncTransactions = useCallback(
        (period: SyncPeriod) => {
            if (!firestore || !transactionsFilename || convertTransactionsData(ConvertAction.local)) return;

            if (period === SyncPeriod.day) {
                processSync(transactionsFilename, period);
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
        if (!firestore || !transactionsFilename) return;

        syncTransactions(SyncPeriod.day); // Synchronize the daily transactions on the first load

        const q = query(collection(firestore, transactionsFilename));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            querySnapshot.docChanges().forEach((change) => {
                // change type can be 'added', 'modified', or 'deleted'
                const tx = change.doc.data() as Transaction;
                console.log(change.type, tx);

                const localTx = transactions.find((transaction) => transaction.createdDate === tx.createdDate);
                const isDeleted = isDeletedTransaction(tx);

                switch (change.type) {
                    case 'added':
                        if (isDeleted && localTx) {
                            setTransactions((transactions) =>
                                transactions.filter((transaction) => transaction.createdDate !== tx.createdDate)
                            );
                        } else if (!isDeleted && !localTx) {
                            setTransactions((transactions) => [...transactions, tx as Transaction]);
                        }
                        break;
                    case 'modified':
                        if (localTx?.method === PROCESSING_KEYWORD) return;

                        setTransactions((transactions) =>
                            transactions.map((transaction) =>
                                transaction.createdDate === tx.createdDate
                                    ? { ...transaction, ...tx, method: WAITING_KEYWORD }
                                    : transaction
                            )
                        );
                        break;
                    case 'removed':
                        setTransactions((transactions) =>
                            transactions.filter((transaction) => transaction.createdDate !== tx.createdDate)
                        );
                        break;
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
        link.download = 'Sauvegarde_' + GET_FORMATTED_DATE() + '.json';

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
                    data.forEach((item: { id: string; transactions: any[] }) => {
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
        (syncAction: SyncAction, event?: ChangeEvent<HTMLInputElement>) => {
            if (!firestore) return;

            switch (syncAction) {
                case SyncAction.fullsync:
                    syncTransactions(SyncPeriod.full);
                    break;
                case SyncAction.daysync:
                    syncTransactions(SyncPeriod.day);
                    break;
                case SyncAction.export:
                    exportTransactions();
                    break;
                case SyncAction.import:
                    importTransactions(event);
                    break;
            }
        },
        [firestore, syncTransactions, exportTransactions, importTransactions]
    );

    const saveTransactions = useCallback(
        async (action: DatabaseAction, transaction: Transaction) => {
            if (!transaction) return;

            transaction.modifiedDate = transaction.modifiedDate ? new Date().getTime() : transaction.createdDate;
            transaction.amount = transaction.amount.clean(
                currencies.find(({ label }) => label === transaction.currency)?.maxDecimals
            );
            transaction.validator = parameters.user.name;

            if (transactions.length) {
                setLocalStorageItem(transactionsFilename, transactions);
            } else {
                localStorage.removeItem(transactionsFilename);
            }

            const index = transaction.createdDate;
            transactionId.current = action === DatabaseAction.update ? index : 0;

            if (!firestore) return;

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
        },
        [transactionsFilename, transactions, parameters.user, firestore, setLocalStorageItem, currencies, storeIndex]
    );

    const deleteTransaction = useCallback(
        (index?: number) => {
            if (!transactions.length) return;

            index = index ?? transactions.findIndex(({ createdDate }) => createdDate === transactionId.current);

            if (index >= 0) {
                const transaction = transactions.splice(index, 1)[0];
                saveTransactions(DatabaseAction.delete, transaction);
            }
        },
        [transactions, saveTransactions]
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
            return amount.toCurrency(currency.maxDecimals, currency.symbol);
        },
        [currencies, currencyIndex]
    );

    const toMercurial = useCallback(
        (quantity: number, mercurial = currentMercurial) => {
            switch (mercurial) {
                case Mercurial.exponential:
                    return Math.pow(2, quantity - 1);
                case Mercurial.soft:
                    return quantity <= 2
                        ? quantity
                        : Array(quantity - 1)
                              .fill(1)
                              .map((_, i) => i + 1)
                              .reduce((a, b) => a + b);
                case Mercurial.zelet:
                    return quantity <= 2 ? quantity : Math.pow(quantity, 2);
                default:
                    return quantity;
            }
        },
        [currentMercurial]
    );

    const fromMercurial = useCallback(
        (quantity: number, maxValue: number, mercurial = currentMercurial) => {
            quantity = Math.floor(quantity);
            while (toMercurial(quantity, mercurial) > maxValue) {
                quantity--;
            }
            return quantity;
        },
        [toMercurial, currentMercurial]
    );

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
        return product.discount.unity === '%'
            ? product.amount * (1 - product.discount.value / 100)
            : product.amount - product.discount.value;
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
                (product.discount.value ? ' (-' + product.discount.value + product.discount.unity + ')' : '')
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
    }, [transactions, parameters.user, addProduct, isProcessingTransaction]);

    const editTransaction = useCallback(
        (index: number) => {
            if (!transactions.length) return;

            const transaction = transactions[index];
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
                          validator: '',
                          method: item,
                          amount: getCurrentTotal(),
                          createdDate: transactionId.current || currentTime,
                          modifiedDate: 0,
                          currency: currencies[currencyIndex].label,
                          products: products.current,
                      };

            storeTransaction(transaction);

            saveTransactions(DatabaseAction.add, transaction);

            clearTotal();
        },
        [clearTotal, products, saveTransactions, getCurrentTotal, currencies, currencyIndex, storeTransaction]
    );

    const displayTransaction = useCallback(
        (transaction: Transaction) => {
            return transaction.createdDate && transaction.method
                ? toCurrency(transaction) +
                      (isWaitingTransaction(transaction) ? ' ' : ' en ') +
                      transaction.method +
                      ' à ' +
                      new Date(transaction.createdDate).toTimeString().slice(0, 9)
                : '';
        },
        [toCurrency, isWaitingTransaction]
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
                isWaitingTransaction,
                isDeletedTransaction,
                transactionsFilename,
                toCurrency,
                isDbConnected,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
