'use client';

import { initializeApp } from 'firebase/app';
import { Firestore, collection, doc, getFirestore, onSnapshot, query, setDoc, updateDoc } from 'firebase/firestore';
import { FC, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Currency, Discount, Mercurial, useConfig } from '../hooks/useConfig';
import { DataContext, Product, Transaction } from '../hooks/useData';
import {
    DELETED_KEYWORD,
    GET_FORMATTED_DATE,
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

        // if (!user.name) return;

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
    }, [user, transactionsFilename]);

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

    const saveTransactions = useCallback(
        (action: DatabaseAction, transaction: Transaction) => {
            if (!transaction) return;

            transaction.modifiedDate = new Date().getTime();
            transaction.validator = user.name;

            if (transactions.length) {
                localStorage.setItem(transactionsFilename, JSON.stringify(transactions));
            } else {
                localStorage.removeItem(transactionsFilename);
            }

            const index = transaction.createdDate;
            transactionId.current = action === DatabaseAction.update ? index : 0;

            if (!firestore) return;

            switch (action) {
                case DatabaseAction.add:
                    setDoc(doc(firestore, transactionsFilename, index.toString()), transaction);
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
        [transactionsFilename, transactions, user, firestore]
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
        [updateTotal]
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
        [currencies, currencyIndex, toMercurial, fromMercurial, updateTotal]
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
            ? transactions.find(({ method, validator }) => method === PROCESSING_KEYWORD && validator === user.name)
            : undefined;
        if (processingTransaction) {
            transactionId.current = processingTransaction.createdDate;
            processingTransaction.products.forEach(addProduct);
        }
    }, [transactions, user, addProduct]);

    const editTransaction = useCallback(
        (index: number) => {
            if (!transactions.length) return;

            const transaction = transactions[index];
            setCurrency(transaction.currency.label);
            transaction.products.forEach(addProduct);
            transaction.method = PROCESSING_KEYWORD;

            saveTransactions(DatabaseAction.update, transaction);
        },
        [transactions, saveTransactions, addProduct]
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

            const index = transactions.findIndex(({ createdDate }) => createdDate === transaction.createdDate);
            if (index >= 0) {
                transactions.splice(index, 1, transaction);
            } else {
                transactions.unshift(transaction);
            }

            transactions.sort((a, b) => (isWaitingTransaction(a) && !isWaitingTransaction(b) ? -1 : 1)); // Put the waiting transaction at the beginning of the list

            saveTransactions(DatabaseAction.add, transaction);

            clearTotal();
        },
        [
            clearTotal,
            products,
            saveTransactions,
            transactions,
            getCurrentTotal,
            isWaitingTransaction,
            currencies,
            currencyIndex,
        ]
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
                updateTransaction,
                editTransaction,
                deleteTransaction,
                displayTransaction,
                isWaitingTransaction,
                transactionsFilename,
                toCurrency,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
