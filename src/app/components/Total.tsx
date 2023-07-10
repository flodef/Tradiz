'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { DataElement, Transaction, useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { OTHER_KEYWORD } from '../utils/env';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';

export const Total: FC = () => {
    const { toCurrency } = useConfig();
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

    const displayProduct = useCallback(
        (product: DataElement) => {
            return (
                (product.label && product.label !== OTHER_KEYWORD ? product.label : product.category) +
                ' : ' +
                toCurrency(product.amount) +
                ' x ' +
                product.quantity +
                ' = ' +
                toCurrency(product.amount * product.quantity)
            );
        },
        [toCurrency]
    );

    const displayTransaction = useCallback(
        (transaction: Transaction) => {
            return toCurrency(transaction.amount) + ' en ' + transaction.method + ' à ' + transaction.date;
        },
        [toCurrency]
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
                toCurrency(products.current.reduce((total, product) => total + product.amount * product.quantity, 0)),
            products.current.map(displayProduct),
            undefined,
            confirmDeleteProduct(deleteProduct, showProducts)
        );
    }, [openPopup, products, displayProduct, deleteProduct, confirmDeleteProduct, toCurrency]);

    const showBoughtProducts = useCallback(
        (index: number, fallback?: () => void) => {
            const transaction = localTransactions?.at(index);
            if (!transaction || !transaction.amount) return;

            setTimeout(() =>
                openPopup(
                    toCurrency(transaction.amount) + ' en ' + transaction.method,
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
        [localTransactions, openPopup, displayProduct, confirmDeleteProduct, saveTransactions, toCurrency]
    );

    const showTransactions = useCallback(() => {
        if (!localTransactions?.length) return;

        const totalAmount = localTransactions.reduce((total, transaction) => total + transaction.amount, 0);
        const totalTransactions = localTransactions.length;
        const summary = localTransactions.map(displayTransaction);

        openPopup(
            totalTransactions + ' vts : ' + toCurrency(totalAmount),
            summary,
            (i) => showBoughtProducts(i, showTransactions),
            {
                confirmTitle: 'Modifier ?',
                action: editTransaction,
            }
        );
    }, [openPopup, localTransactions, editTransaction, displayTransaction, showBoughtProducts, toCurrency]);

    const handleClick = useMemo(() => {
        return total ? showProducts : localTransactions?.length ? showTransactions : () => {};
    }, [showProducts, showTransactions, total, localTransactions]);

    const canDisplayTransactions = useMemo(() => {
        return localTransactions?.length;
    }, [localTransactions]);

    const totalDisplay = useMemo(() => {
        return !canDisplayTransactions ? (
            <div>
                Total : <Amount value={total} showZero />
            </div>
        ) : (
            'Ticket : ' + localTransactions?.length + ' vts'
        );
    }, [total, localTransactions, canDisplayTransactions]);

    const totalDisplayClassName = 'text-5xl truncate text-center font-bold py-3 ';

    return (
        <div>
            <div
                className={useAddPopupClass(
                    'inset-x-0 min-h-[75px] md:absolute md:left-1/2 md:h-full md:border-lime-300 md:border-l-4'
                )}
            >
                <div
                    className={
                        totalDisplayClassName +
                        'md:hidden border-b-[3px] border-orange-300' +
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
                <div className={totalDisplayClassName + 'hidden border-b-[3px] border-orange-300 md:block'}>
                    {totalDisplay}
                </div>

                <div className="text-center text-2xl font-bold py-3 hidden md:block md:max-h-[90%] md:overflow-y-auto">
                    {!canDisplayTransactions
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
                        : localTransactions?.map(displayTransaction).map((transaction, index) => (
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
                          ))}
                </div>
            </div>
        </div>
    );
};
