import { FC, useCallback } from 'react';
import { Digits } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';
import { Separator } from './Separator';

export interface TotalProps {
    maxDecimals: Digits;
}

export const Total: FC<TotalProps> = ({ maxDecimals }) => {
    const { total, products, deleteProduct, transactions, payments } = useData();
    const { openPopup } = usePopup();

    const showProducts = useCallback(() => {
        if (!products.current) return;

        openPopup(
            'Total : ' + total.toFixed(maxDecimals) + '€',
            products.current.map(
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
                ('0' + transaction.date.getMinutes()).slice(-2)
        );

        const showBoughtProducts = (label: string, index: number) => {
            if (!transactions.current || !label) return;

            const transaction = transactions.current.at(index);
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

            setTimeout(
                () =>
                    openPopup(transaction.amount.toFixed(maxDecimals) + '€ en ' + transaction.method, summary, () =>
                        setTimeout(showTransactions, 0)
                    ),
                0
            );
        };

        openPopup(totalTransactions + ' vts : ' + totalAmount.toFixed(maxDecimals) + '€', summary, showBoughtProducts);
    }, [maxDecimals, openPopup, payments, transactions]);

    return (
        <div
            className={useAddPopupClass(
                'inset-x-0 ' + (total || transactions.current ? 'active:bg-orange-300' : 'invisible')
            )}
        >
            <div
                className="text-5xl truncate text-center font-bold py-3"
                onClick={total ? showProducts : transactions.current ? showTransactions : () => {}}
            >
                {total ? (
                    <div>
                        Total : <Amount value={total} decimals={maxDecimals} showZero />
                    </div>
                ) : transactions.current ? (
                    'Ticket : ' + transactions.current.length + ' vts'
                ) : null}
            </div>
            <Separator />
        </div>
    );
};
