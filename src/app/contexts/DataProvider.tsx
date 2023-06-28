import { FC, ReactNode, useCallback, useRef, useState } from 'react';
import { DataContext } from '../hooks/useData';

export interface DataProviderProps {
    children: ReactNode;
}

export const DataProvider: FC<DataProviderProps> = ({ children }) => {
    const [total, setTotal] = useState(0);
    const totalAmount = useRef(0);
    const currentAmount = useRef(0);
    const [numPadValue, setNumPadValue] = useState(0);
    const transaction = useRef<[{ category?: string; amount?: number }]>([{ category: '', amount: 0 }]);
    const payment = useRef<[{ method: string; amount: number }]>([{ method: '', amount: 0 }]);

    const addProduct = useCallback((category: string, amount: number) => {
        if (amount === 0 || !category) return;

        updateTotal(parseFloat((totalAmount.current + amount).toFixed(2)));
        transaction.current.push({ category: category, amount: amount });
        clearAmount();
    }, []);

    const clearAmount = useCallback(() => {
        updateAmount(0);
    }, []);

    const clearTotal = useCallback(() => {
        updateTotal(0);
    }, []);

    const updateAmount = useCallback((value: number) => {
        currentAmount.current = value;
        setNumPadValue(value);
    }, []);

    const updateTotal = useCallback((value: number) => {
        totalAmount.current = value;
        setTotal(value);
    }, []);

    const showTransaction = useCallback(() => {
        console.log(transaction);
    }, [transaction]);

    const clearTransaction = useCallback(() => {
        transaction.current = [{ category: '', amount: 0 }];
    }, []);

    const addPayment = useCallback((method: string) => {
        if (totalAmount.current === 0 || !method) return;

        payment.current.push({ method: method, amount: totalAmount.current });
        clearAmount();
        clearTotal();
    }, []);

    return (
        <DataContext.Provider
            value={{
                total,
                totalAmount,
                currentAmount,
                numPadValue,
                addProduct,
                updateAmount,
                clearAmount,
                clearTotal,
                showTransaction,
                clearTransaction,
                addPayment,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
