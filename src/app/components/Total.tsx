import { FC, useCallback, useEffect, useState } from 'react';
import { Digits } from '../hooks/useConfig';
import { DataElement, useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';
import { Separator } from './Separator';

export interface TotalProps {
    maxDecimals: Digits;
}

export const Total: FC<TotalProps> = ({ maxDecimals }) => {
    const { total, products, deleteProduct, data } = useData();
    const { openPopup } = usePopup();

    const [transactions, setTransactions] = useState<
        [{ method: string; amount: number; date: string; products: [DataElement] }] | undefined
    >();
    useEffect(() => {
        setTransactions(data);
    }, [data]);

    const showProducts = useCallback(() => {
        if (!products) return;

        openPopup(
            'Total : ' + total.toFixed(maxDecimals) + '€',
            products.map(
                (product) =>
                    product.category +
                    ' : ' +
                    product.amount.toFixed(maxDecimals) +
                    '€ x ' +
                    product.quantity +
                    ' = ' +
                    (product.amount * product.quantity).toFixed(maxDecimals) +
                    '€'
            ),
            deleteProduct
        );
    }, [deleteProduct, openPopup, products, total, maxDecimals]);

    const showTransactions = useCallback(() => {
        if (!transactions) return;

        const totalAmount = transactions.reduce((total, transaction) => total + transaction.amount, 0);
        const totalTransactions = transactions.length;
        const summary = transactions.map(
            (transaction) =>
                transaction.amount.toFixed(maxDecimals) + '€ en ' + transaction.method + ' à ' + transaction.date
        );

        const showBoughtProducts = (label: string, index: number) => {
            if (!transactions || !label) return;

            const transaction = transactions.at(index);
            if (!transaction) return;

            const summary = transaction.products.map(
                (product) =>
                    product.category +
                    ' : ' +
                    product.amount.toFixed(maxDecimals) +
                    '€ x ' +
                    product.quantity +
                    ' = ' +
                    (product.amount * product.quantity).toFixed(maxDecimals) +
                    '€'
            );

            setTimeout(() =>
                openPopup(transaction.amount.toFixed(maxDecimals) + '€ en ' + transaction.method, summary, () =>
                    setTimeout(showTransactions)
                )
            );
        };

        openPopup(totalTransactions + ' vts : ' + totalAmount.toFixed(maxDecimals) + '€', summary, showBoughtProducts);
    }, [maxDecimals, openPopup, transactions]);

    return (
        <div
            className={useAddPopupClass('inset-x-0 ' + (total || transactions ? 'active:bg-orange-300' : 'invisible'))}
        >
            <div
                className="text-5xl truncate text-center font-bold py-3"
                onClick={total ? showProducts : transactions ? showTransactions : () => {}}
            >
                {total ? (
                    <div>
                        Total : <Amount value={total} decimals={maxDecimals} showZero />
                    </div>
                ) : transactions ? (
                    'Ticket : ' + transactions.length + ' vts'
                ) : null}
            </div>
            <Separator />
        </div>
    );
};
