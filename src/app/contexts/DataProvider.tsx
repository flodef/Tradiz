'use client';

import { ChangeEvent, FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { DataContext } from '../hooks/useData';
import { useWindowParam } from '../hooks/useWindowParam';
import {
    DELETED_KEYWORD,
    OTHER_KEYWORD,
    PROCESSING_KEYWORD,
    REFUND_KEYWORD,
    TRANSACTIONS_KEYWORD,
    UPDATING_KEYWORD,
    WAITING_KEYWORD,
} from '../utils/constants';
import { getFormattedDate, getTransactionFileName, toSQLDateTime } from '../utils/date';
import { Currency, Discount, OrderData, OrderItem, Product, SyncAction, SyncPeriod, Transaction, TransactionSet } from '../utils/interfaces';
import { isDeletedTransaction, isProcessingTransaction, isWaitingTransaction } from './dataProvider/transactionHelpers';
import { useMercurial } from './dataProvider/useMercurial';

enum DatabaseAction {
    add,
    update,
    delete,
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
    const areTransactionLoaded = useRef(false);
    const [shopId, setShopId] = useState('');
    const [orderId, setOrderId] = useState('');
    const [orderData, setOrderData] = useState<OrderData | null>(null);
    const [selectedOrderItems, setSelectedOrderItems] = useState<OrderItem[]>([]);
    const [partialPaymentAmount, setPartialPaymentAmount] = useState(0);
    const [showPartialPaymentSelector, setShowPartialPaymentSelector] = useState(false);

    const isDbConnected = useMemo(() => isOnline, [isOnline]);

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

    useEffect(() => {
        if (!parameters.shop.name || areTransactionLoaded.current) return;

        const shopId = window.location.pathname.split('/')[1];
        setShopId(shopId);

        const filename = getTransactionFileName(shopId);

        const loadTransactions = async () => {
            let loadedTransactions: Transaction[] = [];

            // Try to load from SQL DB first if enabled
            if (process.env.NEXT_PUBLIC_USE_SQLDB) {
                const sqlTransactions = await loadTransactionsFromSQL();
                if (sqlTransactions) {
                    loadedTransactions = sqlTransactions;
                    console.log('Loaded transactions from SQL DB');
                }
            }

            // Fallback to localStorage if SQL DB is not enabled or failed
            if (!loadedTransactions.length) {
                loadedTransactions = JSON.parse(localStorage.getItem(filename) || '[]') as Transaction[];
            }

            setTransactions(loadedTransactions);
            areTransactionLoaded.current = true;
            setTransactionsFilename(filename);
        };

        loadTransactions();

        const now = new Date();
        const midnight = new Date();
        midnight.setDate(now.getDate() + 1);
        midnight.setHours(0, 0, 0, 0);
        const timeUntilMidnight = midnight.getTime() - now.getTime();
        setTimeout(() => {
            areTransactionLoaded.current = false;
            setTransactionsFilename('');
        }, timeUntilMidnight); // Automatically reload at midnight
    }, [parameters.shop.name, loadTransactionsFromSQL]);

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

    // Synchronize transactions from SQL DB to localStorage
    const fullSync = useCallback(
        (sqlTransactionSets: TransactionSet[], syncPeriod: SyncPeriod) => {
            let localTransactionSets = getLocalTransactions();

            console.log(
                'syncTransactions',
                'sql',
                sqlTransactionSets.sort((a, b) => a.id.localeCompare(b.id)),
                'local',
                localTransactionSets.sort((a, b) => a.id.localeCompare(b.id))
            );

            sqlTransactionSets.forEach((sqlTransactionSet) => {
                const localTransactionSet = localTransactionSets.find((set) => set.id === sqlTransactionSet.id);

                if (!localTransactionSet) {
                    console.log('Added set to local', sqlTransactionSet.id);
                    updateLocalTransaction(sqlTransactionSet);
                } else {
                    const updateTransactionSet: TransactionSet = {
                        id: localTransactionSet.id,
                        transactions: [...localTransactionSet.transactions],
                    };
                    sqlTransactionSet.transactions.forEach((sqlTransaction) => {
                        const index = localTransactionSet.transactions.findIndex(
                            (localTransaction) => localTransaction.createdDate === sqlTransaction.createdDate
                        );

                        if (index === -1) {
                            console.log('Added transaction to local', sqlTransaction);
                            updateTransactionSet.transactions.push(sqlTransaction);
                        } else if (localTransactionSet.id === transactionsFilename) {
                            const localTransaction = localTransactionSet.transactions[index];

                            // SQL DB is the source of truth, always use SQL data
                            if (sqlTransaction.modifiedDate > localTransaction.modifiedDate) {
                                console.log('Updated transaction in local', sqlTransaction);
                                updateTransactionSet.transactions.splice(index, 1, sqlTransaction);
                            }
                        }
                    });
                    updateLocalTransaction(updateTransactionSet);
                }
            });
        },
        [
            getLocalTransactions,
            transactionsFilename,
            updateLocalTransaction,
        ]
    );

    const processSync = useCallback(
        async (syncPeriod: SyncPeriod) => {
            try {
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
                    const sqlTransactionSets: TransactionSet[] = [
                        {
                            id: transactionsFilename,
                            transactions: sqlTransactions,
                        },
                    ];
                    fullSync(sqlTransactionSets, syncPeriod);
                }
                console.log('SQL DB sync completed:', sqlTransactions.length, 'transactions');
            } catch (error) {
                console.error('Error syncing from SQL DB:', error);
            }
        },
        [fullSync, transactionsFilename]
    );

    const syncTransactions = useCallback(
        (period: SyncPeriod, filename = transactionsFilename) => {
            if (!filename) return;
            processSync(period);
        },
        [processSync, transactionsFilename]
    );

    useEffect(() => {
        if (!transactionsFilename) return;
        syncTransactions(SyncPeriod.day); // Synchronize the daily transactions from SQL DB
    }, [transactionsFilename]); // eslint-disable-line react-hooks/exhaustive-deps

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
        [syncTransactions, exportTransactions, importTransactions, shopId, transactionsFilename]
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

            // Save to SQL DB
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

                console.log('SQL DB transaction saved successfully');

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
                        console.log('Order completion notification sent to WebSocket server');
                    } catch (wsError) {
                        console.error('Failed to notify WebSocket server:', wsError);
                        // Don't throw - this is not critical to the transaction
                    }
                }
            } catch (error) {
                console.error('Error handling SQL DB transaction:', error);
                throw error;
            }
        },
        [
            transactionsFilename,
            transactions,
            parameters.user,
            setLocalStorageItem,
            currencies,
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
