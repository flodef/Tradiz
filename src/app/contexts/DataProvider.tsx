'use client';

import { initializeApp } from 'firebase/app';
import { Firestore, collection, doc, getFirestore, onSnapshot, query, setDoc, updateDoc } from 'firebase/firestore';
import { FC, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Currency, Mercurial, useConfig } from '../hooks/useConfig';
import { DataContext, Product, Transaction } from '../hooks/useData';
import {
    DEFAULT_DATE,
    DELETED_KEYWORD,
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
    const { currencies, currencyIndex, mercurial, user } = useConfig();

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

    useEffect(() => {
        setCurrentMercurial(mercurial);
    }, [mercurial]);

    useEffect(() => {
        const filename =
            TRANSACTIONS_KEYWORD +
            (window && window.location.pathname.length > 1 ? window.location.pathname.replaceAll('/', '+') : '') +
            '_' +
            DEFAULT_DATE;

        setTransactionsFilename(filename);

        const transactions = JSON.parse(localStorage.getItem(filename) || '[]') as Transaction[];
        setTransactions(transactions);

        if (!user.name) return;

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
    }, [user]);

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

    const computeQuantity = useCallback(
        (amount: number, quantity = 1, mercurial = currentMercurial) => {
            const maxValue = currencies[currencyIndex].maxValue;
            const quadratic = toMercurial(quantity, mercurial);

            return Math.max(
                1,
                amount * quadratic <= maxValue ? quantity : fromMercurial(maxValue / amount, maxValue, mercurial)
            );
        },
        [currencies, currencyIndex, toMercurial, fromMercurial, currentMercurial]
    );

    const addProduct = useCallback(
        (item?: Product) => {
            const product = item ?? selectedProduct;
            if (!product) return;

            product.amount ||= amount;
            const newQuantity = computeQuantity(
                product.amount,
                quantity > 0 ? quantity : item ? product.quantity : 1, // + (item ? 0 : 1),
                product.mercurial
            );

            if (!product.amount || (!product.label && !product.category)) return;

            setSelectedProduct(product);

            const p = products.current.find(
                ({ label, category, amount }) =>
                    label === product.label && category === product.category && amount === product.amount
            );
            if (p) {
                p.quantity = computeQuantity(
                    product.amount,
                    newQuantity + (quantity < 0 ? p.quantity : 0),
                    product.mercurial
                );
                p.total = product.amount * toMercurial(p.quantity, product.mercurial);
            } else {
                product.quantity = newQuantity;
                product.total = product.amount * toMercurial(product.quantity, product.mercurial);
                products.current.unshift(product);
            }

            // clearAmount();
            updateTotal();
            setQuantity(-1);
        },
        [products, selectedProduct, toMercurial, computeQuantity, updateTotal, quantity, amount]
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
            };
            const p = products.current.find(
                ({ label, category }) => label === product.label && category === product.category
            );

            if (!p) return;

            if (p.quantity === 1) {
                deleteProduct(products.current.indexOf(p));
            } else {
                p.quantity = computeQuantity(p.amount, p.quantity - 1, p.mercurial);
                p.total = p.amount * toMercurial(p.quantity, p.mercurial);
                updateTotal();
            }
        },
        [selectedProduct, products, computeQuantity, toMercurial, deleteProduct, updateTotal]
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
                toCurrency({ amount: product.total ?? 0, currency: currency })
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
