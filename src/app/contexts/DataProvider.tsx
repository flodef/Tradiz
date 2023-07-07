import { FC, ReactNode, useCallback, useRef, useState } from 'react';
import { DataContext, DataElement, Transaction } from '../hooks/useData';
import { categorySeparator, defaultDate } from '../utils/data';
import { useLocalStorage } from '../utils/localStorage';

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
    const [total, setTotal] = useState(0);
    const [amount, setAmount] = useState(0);
    const [quantity, setQuantity] = useState(0);
    const [category, setCategory] = useState('');
    const products = useRef<[DataElement] | undefined>();
    const [transactions, setTransactions] = useLocalStorage<[Transaction] | undefined>(
        'Transactions ' + defaultDate,
        undefined
    );

    const updateTotal = useCallback(() => {
        setTotal(
            products.current
                ? products.current.reduce((total, product) => total + product.amount * product.quantity, 0)
                : 0
        );
    }, []);

    const clearAmount = useCallback(() => {
        setAmount(0);
        setQuantity(0);
        setCategory('');
    }, []);

    const clearTotal = useCallback(() => {
        clearAmount();
        products.current = undefined;
        updateTotal();
    }, [clearAmount, updateTotal]);

    const addProduct = useCallback(
        (product: string | DataElement) => {
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

            products.current = addElement(products.current, element);

            updateTotal();

            clearAmount();
        },
        [amount, quantity, clearAmount, products, category, updateTotal]
    );

    const deleteProduct = useCallback(
        (option: string, index: number) => {
            if (!products.current?.length) return;

            products.current.splice(index, 1).at(0);

            updateTotal();
        },
        [products, updateTotal]
    );

    const saveTransactions = useCallback(
        (transactions: [Transaction]) => {
            setTransactions(undefined);
            if (transactions.length) {
                setTimeout(() => setTransactions(transactions));
            }
        },
        [setTransactions]
    );

    const editTransaction = useCallback(
        (option: string, index: number) => {
            if (!transactions?.length) return;

            transactions.splice(index, 1).at(0)?.products.forEach(addProduct);
            saveTransactions(transactions);
        },
        [transactions, saveTransactions, addProduct]
    );

    const addPayment = useCallback(
        (method: string) => {
            if (!total || !method || !products.current) return;

            const currentHour = new Date().getHours() + 'h' + ('0' + new Date().getMinutes()).slice(-2);
            let newTransactions = addElement(transactions, {
                method: method,
                amount: total,
                date: currentHour,
                products: products.current,
            });

            saveTransactions(newTransactions);

            clearAmount();
            clearTotal();
        },
        [clearAmount, clearTotal, total, products, saveTransactions, transactions]
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
                transactions,
                saveTransactions,
                editTransaction,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
