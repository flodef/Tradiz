import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { DataElement, useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { otherKeyword } from '../utils/data';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';
import { Separator } from './Separator';

export const Total: FC = () => {
    const {
        total,
        amount,
        products,
        selectedCategory,
        deleteProduct,
        transactions,
        saveTransactions,
        editTransaction,
    } = useData();
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
            product.amount.toCurrency() +
            ' x ' +
            product.quantity +
            ' = ' +
            (product.amount * product.quantity).toCurrency()
        );
    }, []);

    const displayTransaction = useCallback(
        (transaction: { method: string; amount: number; date: string; products: [DataElement] }) => {
            return transaction.amount.toCurrency() + ' en ' + transaction.method + ' à ' + transaction.date;
        },
        []
    );

    const confirmDeleteProduct = useCallback((deleteAction: (index: number) => void, fallback: () => void) => {
        return {
            confirmTitle: 'Effacer ?',
            action: (index: number) => {
                deleteAction(index);
                setTimeout(fallback);
            },
        };
    }, []);

    const showProducts = useCallback(() => {
        if (!products.current?.length) return;

        openPopup(
            'Total : ' +
                products.current.reduce((total, product) => total + product.amount * product.quantity, 0).toCurrency(),
            products.current.map(displayProduct),
            undefined,
            confirmDeleteProduct(deleteProduct, showProducts)
        );
    }, [openPopup, products, displayProduct, deleteProduct, confirmDeleteProduct]);

    const showBoughtProducts = useCallback(
        (index: number, fallback?: () => void) => {
            const transaction = localTransactions?.at(index);
            if (!transaction || !transaction.amount) return;

            setTimeout(() =>
                openPopup(
                    transaction.amount.toCurrency() + ' en ' + transaction.method,
                    transaction.products.map(displayProduct),
                    fallback ? () => setTimeout(fallback) : undefined,
                    confirmDeleteProduct(
                        (i) => {
                            if (!localTransactions?.length) return;

                            transaction.products.splice(i, 1);
                            transaction.amount = transaction.products.reduce(
                                (total, product) => total + product.amount * product.quantity,
                                0
                            );
                            if (!transaction.amount) {
                                localTransactions.splice(index, 1);
                            }
                            saveTransactions(localTransactions);
                        },
                        () => showBoughtProducts(index, fallback)
                    )
                )
            );
        },
        [localTransactions, openPopup, displayProduct, confirmDeleteProduct, saveTransactions]
    );

    const showTransactions = useCallback(() => {
        if (!localTransactions?.length) return;

        const totalAmount = localTransactions.reduce((total, transaction) => total + transaction.amount, 0);
        const totalTransactions = localTransactions.length;
        const summary = localTransactions.map(displayTransaction);

        openPopup(
            totalTransactions + ' vts : ' + totalAmount.toCurrency(),
            summary,
            (i) => showBoughtProducts(i, showTransactions),
            {
                confirmTitle: 'Modifier ?',
                action: editTransaction,
            }
        );
    }, [openPopup, localTransactions, editTransaction, displayTransaction, showBoughtProducts]);

    const handleClick = useMemo(() => {
        return total ? showProducts : localTransactions?.length ? showTransactions : () => {};
    }, [showProducts, showTransactions, total, localTransactions]);

    const canDisplayTotal = useMemo(() => {
        return total || amount || selectedCategory;
    }, [total, amount, selectedCategory]);
    const canDisplayTransactions = useMemo(() => {
        return localTransactions?.length;
    }, [localTransactions]);

    const totalDisplay = useMemo(() => {
        return canDisplayTotal ? (
            <div>
                Total : <Amount value={total} showZero />
            </div>
        ) : canDisplayTransactions ? (
            'Ticket : ' + localTransactions?.length + ' vts'
        ) : null;
    }, [total, localTransactions, canDisplayTotal, canDisplayTransactions]);

    const totalDisplayClassName = 'text-5xl truncate text-center font-bold py-3 ';

    return (
        <div
            className={useAddPopupClass(
                'inset-x-0 md:absolute md:left-1/2 md:h-full md:border-lime-300 md:border-l-4' +
                    (total || localTransactions?.length ? '' : ' hidden ')
            )}
        >
            <div
                className={
                    totalDisplayClassName +
                    'md:hidden' +
                    (total || localTransactions?.length ? ' active:bg-orange-300 ' : '')
                }
                onClick={handleClick}
                onContextMenu={(e) => {
                    e.preventDefault();
                    handleClick();
                }}
            >
                {totalDisplay}
            </div>
            <div className={totalDisplayClassName + 'hidden md:block'}>{totalDisplay}</div>

            <Separator />

            <div className="text-center text-2xl font-bold py-3 hidden md:block md:max-h-[90%] md:overflow-y-auto">
                {canDisplayTotal
                    ? products.current?.map(displayProduct).map((product, index) => (
                          <div
                              key={index}
                              onContextMenu={(e) => {
                                  e.preventDefault();
                                  openPopup('Effacer ?', ['Oui', 'Non'], (i) => {
                                      if (i === 0) {
                                          deleteProduct(index);
                                      }
                                  });
                              }}
                          >
                              {product}
                          </div>
                      ))
                    : canDisplayTransactions
                    ? localTransactions?.map(displayTransaction).map((transaction, index) => (
                          <div
                              key={index}
                              onClick={() => showBoughtProducts(index)}
                              onContextMenu={(e) => {
                                  e.preventDefault();
                                  openPopup('Modifier ?', ['Oui', 'Non'], (i) => {
                                      if (i === 0) {
                                          editTransaction(index);
                                      }
                                  });
                              }}
                          >
                              {transaction}
                          </div>
                      ))
                    : null}
            </div>
        </div>
    );
};
