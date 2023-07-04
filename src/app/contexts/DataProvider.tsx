import { FC, ReactNode, useCallback, useMemo, useState } from 'react';
import { DataContext, DataElement, Transaction } from '../hooks/useData';
import { categorySeparator } from '../utils/data';
import { useLocalStorage } from '../utils/localStorage';

export interface DataProviderProps {
    children: ReactNode;
}

export function addElement<T>(array: [T] | undefined, element: T): [T] {
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
    const [category, setCategory] = useState('');
    const [products, setProducts] = useState<[DataElement] | undefined>();
    const today = useMemo(() => {
        const date = new Date();
        return date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
    }, []);
    const [data, setData] = useLocalStorage<[Transaction] | undefined>('Transactions ' + today, undefined);

    const clearAmount = useCallback(() => {
        setAmount(0);
        setQuantity(0);
        setCategory('');
    }, []);

    const clearTotal = useCallback(() => {
        clearAmount();
        setTotal(0);
        setProducts(undefined);
    }, [clearAmount]);

    const addProduct = useCallback(
        (product: string | DataElement) => {
            if (!amount) return;

            let element: DataElement = { category: '', label: '', quantity: 0, amount: 0 };
            if (typeof product === 'object') {
                element = product;
            } else {
                const p = (product ?? category).split(categorySeparator);
                element.category = p.at(0) ?? '';
                element.label = p.at(1) ?? '';
                element.quantity = Math.max(1, quantity);
                element.amount = amount;
            }

            if (!element.category || !element.amount || !element.quantity) return;

            setTotal(parseFloat((total + element.amount * element.quantity).toFixed(2)));

            setProducts(addElement(products, element));

            clearAmount();
        },
        [amount, total, quantity, clearAmount, products, category]
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
                category,
                setCategory,
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
