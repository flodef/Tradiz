'use client';

import { initializeApp } from 'firebase/app';
import {
    Firestore,
    collection,
    doc,
    getDocs,
    getFirestore,
    onSnapshot,
    query,
    setDoc,
    updateDoc,
} from 'firebase/firestore';
import { ChangeEvent, FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Currency, Discount, Mercurial, useConfig } from '../hooks/useConfig';
import { DataContext, Product, SyncAction, Transaction, TransactionSet } from '../hooks/useData';
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

export interface DataProviderProps {
    children: ReactNode;
}

export const DataProvider: FC<DataProviderProps> = ({ children }) => {
    const { currencies, currencyIndex, setCurrency, mercurial, user } = useConfig();
    const { isDemo } = useWindowParam();

    const [transactionsFilename, setTransactionsFilename] = useState('');
    const [total, setTotal] = useState(0);
    const [amount, setAmount] = useState(0);
    const [quantity, setQuantity] = useState(0);
    const [currentMercurial, setCurrentMercurial] = useState(mercurial);
    const [selectedProduct, setSelectedProduct] = useState<Product>();
    const products = useRef<Product[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const transactionId = useRef(0);
    const [firestore, setFirestore] = useState<Firestore>();
    const areTransactionLoaded = useRef(false);

    const isDbConnected = useMemo(() => !!firestore, [firestore]);

    useEffect(() => {
        setCurrentMercurial(mercurial);
    }, [mercurial]);

    useEffect(() => {
        if (!transactionsFilename && !areTransactionLoaded.current) {
            const filename =
                TRANSACTIONS_KEYWORD +
                (window && window.location.pathname.length > 1 ? window.location.pathname.replaceAll('/', '+') : '') +
                '_' +
                GET_FORMATTED_DATE();

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
        }

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
    }, [user, transactionsFilename, isDemo]);

    useEffect(() => {
        if (!firestore || !transactionsFilename) return;

        const q = query(collection(firestore, transactionsFilename));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            querySnapshot.docChanges().forEach((change) => {
                // change type can be 'added', 'modified', or 'deleted'
                const data = change.doc.data();
                console.log(change.type, data);

                //TODO
                // if (change.type === 'added') {
                //     setTransactions((transactions) => [...transactions, data as Transaction]);
                // } else if (change.type === 'modified') {
                //     setTransactions((transactions) =>
                //         transactions.map((transaction) =>
                //             transaction.date === data.date ? { ...transaction, ...data } : transaction
                //         )
                //     );
                // } else if (change.type === 'removed') {
                //     setTransactions((transactions) =>
                //         transactions.filter((transaction) => transaction.date !== data.date)
                //     );
                // }
            });
        });

        return () => unsubscribe();
    }, [firestore, transactionsFilename]);

    const isWaitingTransaction = useCallback((transaction?: Transaction) => {
        return Boolean(transaction && transaction.method === WAITING_KEYWORD);
    }, []);
    const isProcessingTransaction = useCallback((transaction?: Transaction) => {
        return Boolean(transaction && transaction.method === PROCESSING_KEYWORD);
    }, []);
    const isDeletedTransaction = useCallback((transaction?: Transaction) => {
        return Boolean(transaction && transaction.method === DELETED_KEYWORD);
    }, []);

    const setLocalStorageItem = useCallback((key: string, value: string) => {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            alert('Erreur sauvegarde mémoire : capacité de stockage maximale atteinte !');
        }
    }, []);

    const storeTransaction = useCallback(
        (transaction: Transaction) => {
            const index = transactions.findIndex(({ createdDate }) => createdDate === transaction.createdDate);
            if (index >= 0) {
                transactions.splice(index, 1, transaction);
            } else {
                transactions.unshift(transaction);
            }

            setTransactions(
                transactions.toSorted((a, b) => (isWaitingTransaction(a) && !isWaitingTransaction(b) ? -1 : 1))
            ); // Put the waiting transaction at the beginning of the list
        },
        [isWaitingTransaction, transactions, setTransactions]
    );

    // Check if the "transaction set" in the cloud exists in local (check by "id").
    // If not add it, if yes, check if every transaction in the cloud transaction set exist in local (check by "createdDate").
    // If not, add the transaction, if yes, check which one has the biggest "modifiedDate".
    // If it's the cloud one, update the local, if it's the local one, update the cloud.
    // Then, check if the "transaction set" in local exists in the cloud, using the same method as above.
    const fullSync = useCallback(
        (cloudTransactionSets: TransactionSet[], localTransactionSets: TransactionSet[]) => {
            if (!firestore) return;

            console.log(
                'syncTransactions',
                'cloud',
                cloudTransactionSets.sort((a, b) => a.id.localeCompare(b.id)),
                'local',
                localTransactionSets.sort((a, b) => a.id.localeCompare(b.id))
            );

            const updateLocalTransaction = (id: string, transactions: Transaction[]) => {
                const txToUpdate = transactions.filter((transaction) => !isProcessingTransaction(transaction));
                if (txToUpdate.length) {
                    setLocalStorageItem(id, JSON.stringify(txToUpdate));
                }
                txToUpdate
                    .filter((tx) => new Date(tx.createdDate).toLocaleDateString() === new Date().toLocaleDateString())
                    .forEach((tx) => storeTransaction(tx));
            };
            const updateCloudTransaction = (id: string, transaction: Transaction) => {
                setDoc(doc(firestore, id, transaction.createdDate.toString()), transaction);
            };

            cloudTransactionSets.forEach((cloudTransactionSet) => {
                const localTransactionSet = localTransactionSets.find((set) => set.id === cloudTransactionSet.id);

                if (!localTransactionSet) {
                    console.log('Added set to local', cloudTransactionSet.id);
                    updateLocalTransaction(cloudTransactionSet.id, cloudTransactionSet.transactions);
                } else {
                    cloudTransactionSet.transactions.forEach((cloudTransaction) => {
                        const index = localTransactionSet.transactions.findIndex(
                            (localTransaction) => localTransaction.createdDate === cloudTransaction.createdDate
                        );

                        if (index === -1) {
                            console.log('Added transaction to local', cloudTransaction);
                            localTransactionSet.transactions.push(cloudTransaction);
                        } else {
                            const localTransaction = localTransactionSet.transactions[index];

                            if (cloudTransaction.modifiedDate > localTransaction.modifiedDate) {
                                console.log('Updated transaction in local', cloudTransaction);
                                localTransactionSet.transactions.splice(index, 1, cloudTransaction);
                            } else if (cloudTransaction.modifiedDate < localTransaction.modifiedDate) {
                                console.log('Updated transaction in cloud', localTransaction);
                                updateCloudTransaction(cloudTransactionSet.id, localTransaction);
                            }
                        }
                    });
                    updateLocalTransaction(cloudTransactionSet.id, localTransactionSet.transactions);
                }
            });

            localTransactionSets.forEach((localTransactionSet) => {
                const cloudTransactionSet = cloudTransactionSets.find((set) => set.id === localTransactionSet.id);

                if (!cloudTransactionSet) {
                    console.log('Added set to cloud', localTransactionSet.id);
                    localTransactionSet.transactions.forEach((localTransaction) =>
                        updateCloudTransaction(localTransactionSet.id, localTransaction)
                    );
                } else {
                    localTransactionSet.transactions.forEach((localTransaction) => {
                        if (
                            !cloudTransactionSet.transactions.some(
                                (cloudTransaction) => cloudTransaction.createdDate === localTransaction.createdDate
                            )
                        ) {
                            console.log('Added transaction to cloud', localTransaction);
                            updateCloudTransaction(localTransactionSet.id, localTransaction);
                        }
                    });
                }
            });
        },
        [firestore, storeTransaction, isProcessingTransaction, setLocalStorageItem]
    );

    const syncTransactions = useCallback(
        (localTransactionSets: TransactionSet[]) => {
            if (!firestore) return;

            const fileName = transactionsFilename.split('_')[0];

            const cloudTransactionSets: TransactionSet[] = [];
            getDocs(collection(firestore, 'Indexes')).then((querySnapshot) => {
                const tx = querySnapshot.docs.filter((doc) => doc.id.includes(fileName));
                let txToProcess = tx.length;

                console.log('Loaded all tx:', txToProcess);

                tx.forEach((doc) => {
                    const id = doc.id;
                    getDocs(collection(firestore, id)).then((query) => {
                        const transactions: Transaction[] = [];
                        query.forEach((doc) => transactions.push(doc.data() as Transaction));
                        cloudTransactionSets.push({ id, transactions });

                        console.log('txToProcess', txToProcess);

                        if (!--txToProcess) {
                            fullSync(cloudTransactionSets, localTransactionSets);
                        }
                    });
                });
            });
        },
        [firestore, transactionsFilename, fullSync]
    );

    const exportTransactions = useCallback((localTransactionSets: TransactionSet[]) => {
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
    }, []);

    const importTransactions = useCallback(
        (event?: ChangeEvent<HTMLInputElement>) => {
            if (!event) return;

            const file = event.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const jsonData = event.target?.result;
                    alert('Import en cours...');
                    if (typeof jsonData === 'string') {
                        const data = JSON.parse(jsonData);

                        // Store the data in the localStorage
                        data.forEach((item: { id: string; transactions: any[] }) => {
                            setLocalStorageItem(item.id, JSON.stringify(item.transactions));
                        });
                    }
                } catch (error) {
                    alert(error);
                }
            };

            reader.readAsText(file);
        },
        [setLocalStorageItem]
    );

    const processTransactions = useCallback(
        (syncAction: SyncAction, event?: ChangeEvent<HTMLInputElement>) => {
            if (!firestore) return;

            const fileName = transactionsFilename.split('_')[0];

            const localTransactionSets: TransactionSet[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.includes(fileName)) {
                    const value = localStorage.getItem(key);
                    if (value) {
                        const transactions = JSON.parse(value) as Transaction[];
                        localTransactionSets.push({ id: key, transactions });
                    }
                }
            }

            switch (syncAction) {
                case SyncAction.sync:
                    syncTransactions(localTransactionSets);
                    break;
                case SyncAction.export:
                    exportTransactions(localTransactionSets);
                    break;
                case SyncAction.import:
                    importTransactions(event);
                    break;
            }
        },
        [firestore, transactionsFilename, syncTransactions, exportTransactions, importTransactions]
    );

    const saveTransactions = useCallback(
        (action: DatabaseAction, transaction: Transaction) => {
            if (!transaction) return;

            transaction.modifiedDate = new Date().getTime();
            transaction.validator = user.name;

            if (transactions.length) {
                setLocalStorageItem(transactionsFilename, JSON.stringify(transactions));
            } else {
                localStorage.removeItem(transactionsFilename);
            }

            const index = transaction.createdDate;
            transactionId.current = action === DatabaseAction.update ? index : 0;

            if (!firestore) return;

            switch (action) {
                case DatabaseAction.add:
                    setDoc(doc(firestore, transactionsFilename, index.toString()), transaction);
                    setDoc(doc(firestore, 'Indexes', transactionsFilename), {});
                    break;
                case DatabaseAction.update:
                    updateDoc(doc(firestore, transactionsFilename, index.toString()), {
                        method: PROCESSING_KEYWORD,
                    });
                    break;
                case DatabaseAction.delete:
                    updateDoc(doc(firestore, transactionsFilename, index.toString()), {
                        method: DELETED_KEYWORD,
                    });
                    break;
            }
        },
        [transactionsFilename, transactions, user, firestore, setLocalStorageItem]
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
        (element: { amount: number; currency?: Currency } | number | Product | Transaction) => {
            const currency =
                (typeof element !== 'number' && element.hasOwnProperty('currency')
                    ? (element as { currency: Currency }).currency
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
        setCurrentMercurial(mercurial);
        setSelectedProduct(undefined);
        updateTotal();
    }, [updateTotal, mercurial]);

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

            product.quantity = Math.max(
                1,
                amount * quadratic <= maxValue
                    ? quantity
                    : fromMercurial(maxValue / amount, maxValue, product.mercurial)
            );
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

            if (p.quantity === 1) {
                deleteProduct(products.current.indexOf(p));
            } else {
                computeQuantity(p, p.quantity - 1);
            }
        },
        [selectedProduct, products, computeQuantity, deleteProduct]
    );

    const displayProduct = useCallback(
        (product: Product, currency?: Currency) => {
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
                  (transaction) => isProcessingTransaction(transaction) && transaction.validator === user.name
              )
            : undefined;
        if (processingTransaction) {
            transactionId.current = processingTransaction.createdDate;
            processingTransaction.products.forEach(addProduct);
        }
    }, [transactions, user, addProduct, isProcessingTransaction]);

    const editTransaction = useCallback(
        (index: number) => {
            if (!transactions.length) return;

            const transaction = transactions[index];
            setCurrency(transaction.currency.label);
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
                          currency: currencies[currencyIndex],
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
            return (
                toCurrency(transaction) +
                (isWaitingTransaction(transaction) ? ' ' : ' en ') +
                transaction.method +
                ' à ' +
                new Date(transaction.createdDate).toTimeString().slice(0, 9)
            );
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
