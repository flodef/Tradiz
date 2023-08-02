'use client';

import { FC, ReactNode, useCallback, useRef, useState } from 'react';
import { Mercurial, useConfig } from '../hooks/useConfig';
import { DataContext, DataElement, Transaction } from '../hooks/useData';
import { CATEGORY_SEPARATOR, DEFAULT_DATE, OTHER_KEYWORD } from '../utils/constants';
import { useLocalStorage } from '../utils/localStorage';

export const transactionsKeyword = 'Transactions';
export const transactionsRegex = /Transactions \d{4}-\d{1,2}-\d{1,2}/;

export interface DataProviderProps {
    children: ReactNode;
}

export function addElement<T>(array: [T] | undefined, element: T): [T] {
    if (!array?.length) {
        return [element];
    } else {
        array.unshift(element);
        return array;
    }
}

export const DataProvider: FC<DataProviderProps> = ({ children }) => {
    const { currencies, currencyIndex, mercurial } = useConfig();

    const [total, setTotal] = useState(0);
    const [amount, setAmount] = useState(0);
    const [quantity, setQuantity] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState('');
    const products = useRef<[DataElement]>();
    const [transactions, setTransactions] = useLocalStorage<[Transaction] | undefined>(
        transactionsKeyword + ' ' + DEFAULT_DATE,
        undefined
    );

    const toCurrency = useCallback(
        (value: number) => {
            return value.toCurrency(currencies[currencyIndex].maxDecimals, currencies[currencyIndex].symbol);
        },
        [currencies, currencyIndex]
    );

    const toQuadratic = useCallback(
        (quantity: number) => {
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
        [mercurial]
    );

    const getCurrentTotal = useCallback(() => {
        return products.current
            ? products.current.reduce((total, product) => total + product.amount * toQuadratic(product.quantity), 0)
            : 0;
    }, [products, toQuadratic]);

    const updateTotal = useCallback(() => {
        setTotal(getCurrentTotal());
    }, [getCurrentTotal]);

    const clearAmount = useCallback(() => {
        setAmount(0);
        setQuantity(0);
        setSelectedCategory('');
        updateTotal();
    }, [updateTotal]);

    const clearTotal = useCallback(() => {
        products.current = undefined;
        clearAmount();
    }, [clearAmount]);

    const addProduct = useCallback(
        (product: string | DataElement) => {
            let element: DataElement = { category: '', label: '', quantity: 0, amount: 0 };
            if (typeof product === 'object') {
                element = product;
            } else {
                const p = (product ?? selectedCategory).split(CATEGORY_SEPARATOR);
                element.category = p.at(0) ?? '';
                element.label = p.at(1) ?? '';
                element.quantity = Math.max(1, quantity);
                element.amount = amount;
            }

            if (!element.category || !element.amount || !element.quantity) return;

            const p = products.current?.find(
                ({ label, amount }) => label === element.label && amount === element.amount
            );
            if (p) {
                p.quantity += element.quantity;
            } else {
                products.current = addElement(products.current, element);
            }

            clearAmount();
        },
        [amount, quantity, clearAmount, products, selectedCategory]
    );

    const deleteProduct = useCallback(
        (index: number) => {
            if (!products.current?.length || !products.current.at(index)) return;

            products.current.splice(index, 1).at(0);

            clearAmount();
        },
        [products, clearAmount]
    );

    const displayProduct = useCallback(
        (product: DataElement) => {
            return (
                (product.label && product.label !== OTHER_KEYWORD ? product.label : product.category) +
                ' : ' +
                toCurrency(product.amount) +
                ' x ' +
                product.quantity +
                ' = ' +
                toCurrency(product.amount * toQuadratic(product.quantity))
            );
        },
        [toCurrency, toQuadratic]
    );

    const saveTransactions = useCallback(
        (transactions: [Transaction]) => {
            setTransactions(undefined);
            if (transactions.length) {
                setTimeout(() => setTransactions(transactions)); // Set a time out to avoid a bug with the localStorage when the transactions are not updated
            }
        },
        [setTransactions]
    );

    const editTransaction = useCallback(
        (index: number) => {
            if (!transactions?.length) return;

            transactions.splice(index, 1).at(0)?.products.forEach(addProduct);
            saveTransactions(transactions);
        },
        [transactions, saveTransactions, addProduct]
    );

    const addPayment = useCallback(
        (method: string) => {
            if (!method || !products.current) return;

            const currentHour = new Date().getHours() + 'h' + ('0' + new Date().getMinutes()).slice(-2);
            let newTransactions = addElement(transactions, {
                method: method,
                amount: getCurrentTotal(),
                date: currentHour,
                products: products.current,
            });

            saveTransactions(newTransactions);

            clearTotal();
        },
        [clearTotal, products, saveTransactions, transactions, getCurrentTotal]
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
                toQuadratic,
                selectedCategory,
                setSelectedCategory,
                addProduct,
                deleteProduct,
                displayProduct,
                clearAmount,
                clearTotal,
                products,
                addPayment,
                transactions,
                saveTransactions,
                editTransaction,
                toCurrency,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
