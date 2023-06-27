import React, { FC, ReactNode, useCallback, useRef, useState } from 'react';
import { DataContext } from '../hooks/useData';

export interface DataProviderProps {
    children: ReactNode;
}

export const DataProvider: FC<DataProviderProps> = ({ children }) => {
    const [total, setTotal] = useState(0);
    const totalAmount = useRef(0);
    const currentAmount = useRef(0);
    const [numPadValue, setNumPadValue] = useState(0);
    const [transaction, setTransaction] = useState<[{ category: string; amount: number }]>([
        { category: '', amount: 0 },
    ]);

    const addTransaction = useCallback((category: string, value: number) => {
        if (value === 0 || !category) return;

        updateTotal(parseFloat((totalAmount.current + value).toFixed(2)));
        transaction.push({ category: category, amount: value });
        currentAmount.current = 0;
        setNumPadValue(0);
    }, []);

    const clearTotal = useCallback(() => {
        updateTotal(0);
    }, []);

    const updateTotal = useCallback((value: number) => {
        totalAmount.current = value;
        setTotal(value);
    }, []);

    const showTransactionSummary = useCallback(() => {
        console.log(transaction);
    }, [transaction]);

    const clearTransactionSummary = useCallback(() => {
        setTransaction([{ category: '', amount: 0 }]);
    }, []);

    return (
        <DataContext.Provider
            value={{
                total,
                totalAmount,
                currentAmount,
                numPadValue,
                setNumPadValue,
                addTransaction,
                clearTotal,
                showTransactionSummary,
                clearTransactionSummary,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
