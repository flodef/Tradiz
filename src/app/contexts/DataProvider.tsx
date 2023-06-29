import { FC, MutableRefObject, ReactNode, useCallback, useRef, useState } from 'react';
import { DataContext } from '../hooks/useData';

export interface DataProviderProps {
    children: ReactNode;
    taxes: { category: string; rate: number }[];
}

export const DataProvider: FC<DataProviderProps> = ({ children, taxes }) => {
    const [total, setTotal] = useState(0);
    const totalAmount = useRef(0);
    const currentAmount = useRef(0);
    const [numPadValue, setNumPadValue] = useState(0);
    const products = useRef<[{ category: string; amount: number }]>();
    const transactions = useRef<[{ category: string; quantity: number; amount: number }]>();
    const payments = useRef<[{ method: string; quantity: number; amount: number }]>();

    const addProduct = useCallback((category: string) => {
        if (currentAmount.current === 0 || !category) return;

        updateTotal(parseFloat((totalAmount.current + currentAmount.current).toFixed(2)));

        addElement(products, { category: category, amount: currentAmount.current });
        clearAmount();
    }, []);

    const deleteProduct = useCallback((label: string) => {
        if (totalAmount.current === 0 || !label || !products.current) return;

        const index = parseInt(label.split('.')[0]) - 1;

        const product = products.current.splice(index, 1).at(0);
        if (!product) return;

        updateTotal(parseFloat((totalAmount.current - product.amount).toFixed(2)));
    }, []);

    const clearAmount = useCallback(() => {
        updateAmount(0);
    }, []);

    const clearTotal = useCallback(() => {
        updateTotal(0);
        products.current = undefined;
    }, []);

    const updateAmount = useCallback((value: number) => {
        currentAmount.current = value;
        setNumPadValue(value);
    }, []);

    const updateTotal = useCallback((value: number) => {
        totalAmount.current = value;
        setTotal(value);
    }, []);

    const addPayment = useCallback((method: string) => {
        if (totalAmount.current === 0 || !method || !products.current) return;

        const payment = payments.current?.find((payment) => payment.method === method);
        if (payment) {
            payment.quantity++;
            payment.amount += totalAmount.current;
        } else {
            addElement(payments, { method: method, quantity: 1, amount: totalAmount.current });
        }

        products.current.forEach((product) => {
            const transaction = transactions.current?.find((transaction) => transaction.category === product.category);
            if (transaction) {
                transaction.quantity++;
                transaction.amount += product.amount;
            } else {
                addElement(transactions, { category: product.category, quantity: 1, amount: product.amount });
            }
        });
        clearAmount();
        clearTotal();
    }, []);

    function addElement<T>(array: MutableRefObject<[T] | undefined>, element: T) {
        if (!array.current) {
            array.current = [element];
        } else {
            array.current.push(element);
        }
    }

    return (
        <DataContext.Provider
            value={{
                total,
                totalAmount,
                currentAmount,
                numPadValue,
                addProduct,
                deleteProduct,
                updateAmount,
                clearAmount,
                clearTotal,
                products,
                transactions,
                addPayment,
                payments,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
