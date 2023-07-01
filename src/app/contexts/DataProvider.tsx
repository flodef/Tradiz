import { FC, MutableRefObject, ReactNode, useCallback, useRef, useState } from 'react';
import { DataContext, Element } from '../hooks/useData';

export interface DataProviderProps {
    children: ReactNode;
}

export const DataProvider: FC<DataProviderProps> = ({ children }) => {
    const [total, setTotal] = useState(0);
    const [amount, setAmount] = useState(0);
    const [quantity, setQuantity] = useState(0);
    const products = useRef<[Element]>();
    const categories = useRef<[Element]>();
    const payments = useRef<[Element]>();
    const transactions = useRef<[{ method: string; amount: number; date: Date; products: [Element] }]>();

    const clearAmount = useCallback(() => {
        setAmount(0);
        setQuantity(0);
    }, []);

    const clearTotal = useCallback(() => {
        setTotal(0);
        products.current = undefined;
    }, []);

    const addProduct = useCallback(
        (category: string) => {
            if (!amount || !category) return;

            const qty = Math.max(1, quantity);
            setTotal(parseFloat((total + amount * qty).toFixed(2)));

            addElement(products, {
                category: category,
                quantity: qty,
                amount: amount,
            });
            clearAmount();
        },
        [amount, total, quantity, clearAmount]
    );

    const deleteProduct = useCallback(
        (label: string, index: number) => {
            if (!total || !label || !products.current) return;

            const product = products.current.splice(index, 1).at(0);
            if (!product) return;

            setTotal(
                parseFloat(
                    products.current.reduce((total, product) => total + product.amount * product.quantity, 0).toFixed(2)
                )
            );
        },
        [total, products]
    );

    const addPayment = useCallback(
        (method: string) => {
            if (!total || !method || !products.current) return;

            addElement(transactions, {
                method: method,
                amount: total,
                date: new Date(),
                products: products.current,
            });

            const payment = payments.current?.find((payment) => payment.category === method);
            if (payment) {
                payment.quantity++;
                payment.amount += total;
            } else {
                addElement(payments, { category: method, quantity: 1, amount: total });
            }

            products.current.forEach((product) => {
                const transaction = categories.current?.find(
                    (transaction) => transaction.category === product.category
                );
                if (transaction) {
                    transaction.quantity += product.quantity;
                    transaction.amount += product.amount * product.quantity;
                } else {
                    addElement(categories, {
                        category: product.category,
                        quantity: product.quantity,
                        amount: product.amount * product.quantity,
                    });
                }
            });
            clearAmount();
            clearTotal();
        },
        [total, products, payments, categories, transactions, clearAmount, clearTotal]
    );

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
                amount,
                setAmount,
                quantity,
                setQuantity,
                addProduct,
                deleteProduct,
                clearAmount,
                clearTotal,
                products,
                categories,
                addPayment,
                payments,
                transactions,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
