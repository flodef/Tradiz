import { FC, useCallback } from 'react';
import { Digits } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { Amount } from './Amount';
import { addPopupClass } from './Popup';
import { Separator } from './Separator';

export interface TotalProps {
    maxDecimals: Digits;
}

export const Total: FC<TotalProps> = ({ maxDecimals }) => {
    const { total, totalAmount, products, deleteProduct, transactions, payments } = useData();
    const { openPopup } = usePopup();

    const showProducts = useCallback(() => {
        if (!products.current) return;

        openPopup(
            'Total : ' + totalAmount.current + '€',
            products.current.map((product) => product.category + ' : ' + product.amount + '€'),
            deleteProduct
        );
    }, []);

    const showTransactions = useCallback(() => {
        if (!payments.current || !transactions.current) return;

        const totalAmount = payments.current.reduce((total, payment) => total + payment.amount, 0);
        const totalTransactions = payments.current.reduce((total, payment) => total + payment.quantity, 0);
        const summary = transactions.current.map(
            (transaction) =>
                transaction.amount.toFixed(maxDecimals) +
                '€ en ' +
                transaction.method +
                ' à ' +
                transaction.date.getHours() +
                'h' +
                transaction.date.getMinutes()
        );

        openPopup(totalTransactions + ' vts : ' + totalAmount.toFixed(maxDecimals) + '€', summary, showBoughtProducts);
    }, []);

    const showBoughtProducts = useCallback((label: string, index: number) => {
        if (!transactions.current || !label) return;

        const transaction = transactions.current.at(index);
        if (!transaction) return;

        const summary = transaction.products.map((product) => product.category + ' : ' + product.amount + '€');

        setTimeout(
            () => openPopup(transaction.amount.toFixed(maxDecimals) + '€ en ' + transaction.method, summary),
            100
        );
    }, []);

    return (
        <div
            className={addPopupClass(
                'inset-x-0 ' + (totalAmount.current || transactions.current ? 'active:bg-orange-300' : 'text-gray-300')
            )}
        >
            <div
                className="text-5xl truncate text-center font-bold py-3"
                onClick={totalAmount.current ? showProducts : transactions.current ? showTransactions : () => {}}
            >
                Total : <Amount value={total} decimals={maxDecimals} showZero />
            </div>
            <Separator />
        </div>
    );
};
