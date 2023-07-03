import { FC, ReactNode, useCallback, useMemo, useState } from 'react';
import { DataContext, DataElement, Transaction } from '../hooks/useData';
import { useLocalStorage } from '../utils/localStorage';

export interface DataProviderProps {
    children: ReactNode;
}

function addElement<T>(array: [T] | undefined, element: T): [T] {
    if (!array) {
        return [element];
    } else {
        array.unshift(element);
        return array;
    }
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
    const [data, setData] = useLocalStorage<[Transaction] | undefined>('Transactions ' + today, undefined);

    const clearAmount = useCallback(() => {
        setAmount(0);
        setQuantity(0);
    }, []);

    const clearTotal = useCallback(() => {
        setTotal(0);
        setQuantity(0);
        setProducts(undefined);
    }, []);

    const addProduct = useCallback(
        (product: string | DataElement) => {
            if ((!amount && typeof product === 'string') || !product) return;

            let element: DataElement = { category: '', quantity: 0, amount: 0 };
            if (typeof product === 'string') {
                element.category = product;
                element.quantity = Math.max(1, quantity);
                element.amount = amount;
            } else {
                element = product;
            }

            setTotal(parseFloat((total + element.amount * element.quantity).toFixed(2)));

            setProducts(addElement(products, element));

            clearAmount();
        },
        [amount, total, quantity, clearAmount, products]
    );

    const deleteProduct = useCallback(
        (label: string, index: number) => {
            if (!total || !label || !products?.length) return;

            const product = products.splice(index, 1).at(0);
            if (!product) return;

            setTotal(
                parseFloat(products.reduce((total, product) => total + product.amount * product.quantity, 0).toFixed(2))
            );
        },
        [total, products]
    );

    const saveData = useCallback(
        (transactions: [Transaction]) => {
            setData(undefined);
            if (transactions.length) {
                setTimeout(() => setData(transactions));
            }
        },
        [setData]
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

            saveData(transactions);

            clearAmount();
            clearTotal();
        },
        [clearAmount, clearTotal, total, products, saveData, data]
    );

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
                saveData,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
