import { FC, MutableRefObject, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataContext, DataElement } from '../hooks/useData';
import { useLocalStorage } from '../utils/localStorage';

export interface DataProviderProps {
    children: ReactNode;
}

export const DataProvider: FC<DataProviderProps> = ({ children }) => {
    const [total, setTotal] = useState(0);
    const [amount, setAmount] = useState(0);
    const [quantity, setQuantity] = useState(0);
    const [products, setProducts] = useState<[DataElement] | undefined>();
    const today = useMemo(() => {
        const date = new Date();
        return date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
    }, []);
    const [data, setData] = useLocalStorage<
        [{ method: string; amount: number; date: string; products: [DataElement] }] | undefined
    >('Transactions ' + today, undefined);

    const clearAmount = useCallback(() => {
        setAmount(0);
        setQuantity(0);
    }, []);

    const clearTotal = useCallback(() => {
        setTotal(0);
        setProducts(undefined);
    }, []);

    const addProduct = useCallback(
        (category: string) => {
            if (!amount || !category) return;

            const qty = Math.max(1, quantity);
            setTotal(parseFloat((total + amount * qty).toFixed(2)));

            setProducts(
                addElement(products, {
                    category: category,
                    quantity: qty,
                    amount: amount,
                })
            );

            clearAmount();
        },
        [amount, total, quantity, clearAmount, products]
    );

    const deleteProduct = useCallback(
        (label: string, index: number) => {
            if (!total || !label || !products) return;

            const product = products.splice(index, 1).at(0);
            if (!product) return;

            setTotal(
                parseFloat(products.reduce((total, product) => total + product.amount * product.quantity, 0).toFixed(2))
            );
        },
        [total, products]
    );

    const addPayment = useCallback(
        (method: string) => {
            if (!total || !method || !products) return;

            const currentHour = new Date().getHours() + 'h' + ('0' + new Date().getMinutes()).slice(-2);
            let transactions = addElement(data, {
                method: method,
                amount: total,
                date: currentHour,
                products: products,
            });

            setData(undefined);
            setTimeout(() => setData(transactions));

            clearAmount();
            clearTotal();
        },
        [clearAmount, clearTotal, total, products, setData, data]
    );

    function addElement<T>(array: [T] | undefined, element: T): [T] {
        if (!array) {
            return [element];
        } else {
            array.push(element);
            return array;
        }
    }

    return (
        <DataContext.Provider
            value={{
                total,
                amount,
                setAmount,
                quantity,
                setQuantity,
                addProduct,
                deleteProduct,
                clearAmount,
                clearTotal,
                products,
                addPayment,
                data,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
