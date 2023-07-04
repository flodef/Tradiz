import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { DataElement, useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { maxDecimals, otherKeyword } from '../utils/data';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';
import { Separator } from './Separator';

export const Total: FC = () => {
    const { total, amount, products, addProduct, deleteProduct, transactions, saveTransactions } = useData();
    const { openPopup } = usePopup();

    // Hack to avoid differences between the server and the client, generating hydration issues
    const [localTransactions, setLocalTransactions] = useState<
        [{ method: string; amount: number; date: string; products: [DataElement] }] | undefined
    >();
    useEffect(() => {
        setLocalTransactions(transactions);
    }, [transactions]);

    const displayProduct = useCallback((product: DataElement) => {
        return (
            (product.label && product.label !== otherKeyword ? product.label : product.category) +
            ' : ' +
            product.amount.toFixed(maxDecimals) +
            '€ x ' +
            product.quantity +
            ' = ' +
            (product.amount * product.quantity).toFixed(maxDecimals) +
            '€'
        );
    }, []);

    const confirmDeleteProduct = useCallback(
        (deleteAction: (option: string, index: number) => void, fallback: () => void) => {
            return {
                confirmTitle: 'Effacer ?',
                action: (option: string, index: number) => {
                    deleteAction(option, index);
                    setTimeout(fallback);
                },
            };
        },
        []
    );

    const showProducts = useCallback(() => {
        if (!products.current?.length) return;

        openPopup(
            'Total : ' +
                products.current
                    .reduce((total, product) => total + product.amount * product.quantity, 0)
                    .toFixed(maxDecimals) +
                '€',
            products.current.map(displayProduct),
            undefined,
            confirmDeleteProduct(deleteProduct, showProducts)
        );
    }, [openPopup, products, displayProduct, deleteProduct, confirmDeleteProduct]);

    const showTransactions = useCallback(() => {
        if (!localTransactions?.length) return;

        const totalAmount = localTransactions.reduce((total, transaction) => total + transaction.amount, 0);
        const totalTransactions = localTransactions.length;
        const summary = localTransactions.map(
            (transaction) =>
                transaction.amount.toFixed(maxDecimals) + '€ en ' + transaction.method + ' à ' + transaction.date
        );

        const showBoughtProducts = (label: string, index: number) => {
            const transaction = localTransactions?.at(index);
            if (!transaction || !transaction.amount || !label) return;

            setTimeout(() =>
                openPopup(
                    transaction.amount.toFixed(maxDecimals) + '€ en ' + transaction.method,
                    transaction.products.map(displayProduct),
                    () => setTimeout(showTransactions),
                    confirmDeleteProduct(
                        (p_option, p_index) => {
                            transaction.products.splice(p_index, 1);
                            transaction.amount = transaction.products.reduce(
                                (total, product) => total + product.amount * product.quantity,
                                0
                            );
                            if (!transaction.amount) {
                                localTransactions.splice(index, 1);
                            }
                            saveTransactions(localTransactions);
                        },
                        () => showBoughtProducts(label, index)
                    )
                )
            );
        };

        openPopup(totalTransactions + ' vts : ' + totalAmount.toFixed(maxDecimals) + '€', summary, showBoughtProducts, {
            confirmTitle: 'Modifier ?',
            action: (...param) => {
                localTransactions.at(param[1])?.products.forEach(addProduct);
                localTransactions.splice(param[1], 1);
                saveTransactions(localTransactions);
            },
        });
    }, [openPopup, localTransactions, addProduct, saveTransactions, displayProduct, confirmDeleteProduct]);

    const handleClick = useMemo(() => {
        return total ? showProducts : localTransactions?.length ? showTransactions : () => {};
    }, [showProducts, showTransactions, total, localTransactions]);

    return (
        <div
            className={useAddPopupClass(
                'inset-x-0 ' + (total || localTransactions?.length ? 'active:bg-orange-300' : 'invisible')
            )}
        >
            <div
                className="text-5xl truncate text-center font-bold py-3"
                onClick={handleClick}
                onContextMenu={(e) => {
                    e.preventDefault();
                    handleClick();
                }}
            >
                {total || amount ? (
                    <div>
                        Total : <Amount value={total} decimals={maxDecimals} showZero />
                    </div>
                ) : localTransactions?.length ? (
                    'Ticket : ' + localTransactions.length + ' vts'
                ) : null}
            </div>
            <Separator />
        </div>
    );
};
