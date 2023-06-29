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
            products.current.map((product, index) => ++index + '. ' + product.category + ' : ' + product.amount + '€'),
            deleteProduct
        );
    }, []);

    const showTransactions = useCallback(() => {
        if (!transactions.current || !payments.current) return;

        const totalAmount = payments.current.reduce((total, payment) => total + payment.amount, 0);
        const totalTransactions = transactions.current.reduce((total, transaction) => total + transaction.quantity, 0);
        openPopup(
            'CA x ' + totalTransactions + ' ==> ' + totalAmount + '€',
            transactions.current
                .map(
                    (transaction) =>
                        transaction.category + ' x ' + transaction.quantity + ' ==> ' + transaction.amount + '€'
                )
                .concat([''])
                .concat(
                    payments.current.map(
                        (payment) => payment.method + ' x ' + payment.quantity + ' ==> ' + payment.amount + '€'
                    )
                ),
            () => {}
        );
    }, []);

    return (
        <div
            className={addPopupClass(
                'absolute inset-x-0 top-0 ' +
                    (totalAmount.current || transactions.current ? 'active:bg-orange-300' : 'text-gray-300')
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
