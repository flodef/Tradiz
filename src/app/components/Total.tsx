'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { DataElement, Transaction, useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { OTHER_KEYWORD } from '../utils/env';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';

export const Total: FC = () => {
    const { paymentMethods, toCurrency } = useConfig();
    const {
        total,
        getCurrentTotal,
        amount,
        products,
        selectedCategory,
        addProduct,
        deleteProduct,
        addPayment,
        transactions,
        saveTransactions,
        editTransaction,
    } = useData();
    const { openPopup, closePopup } = usePopup();

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

    const confirmDeleteProduct = useCallback((deleteAction: (index: number) => void) => {
        return {
            confirmTitle: 'Effacer ?',
            action: deleteAction,
        };
    }, []);

    const showProducts = useCallback(
        (newAmount = amount) => {
            let canPay = total && !newAmount;
            if (newAmount && selectedCategory) {
                addProduct(selectedCategory);
                canPay = true;
            }
            if (!products.current?.length) return;

            const newTotal = toCurrency(getCurrentTotal());

            openPopup(
                products.current.length + ' produits : ' + newTotal,
                products.current.map(displayProduct).concat(canPay ? ['', 'PAYER'] : []),
                (index, option) => {
                    if (option === 'PAYER') {
                        openPopup('Paiement : ' + newTotal, paymentMethods, (i, o) => addPayment(o));
                    }
                },
                true,
                confirmDeleteProduct((i) => {
                    deleteProduct(i);
                    if (products.current?.length) {
                        showProducts(0);
                    } else {
                        closePopup();
                    }
                })
            );
        },
        [
            total,
            getCurrentTotal,
            amount,
            addProduct,
            addPayment,
            selectedCategory,
            products,
            openPopup,
            closePopup,
            displayProduct,
            confirmDeleteProduct,
            deleteProduct,
            toCurrency,
            paymentMethods,
        ]
    );

    const deleteBoughtProduct = useCallback(
        (index: number, transaction: Transaction, backToProducts: () => void, backToTransactions: () => void) => {
            if (!localTransactions?.length) return;

            transaction.products.splice(index, 1);
            transaction.amount = transaction.products.reduce(
                (total, product) => total + product.amount * product.quantity,
                0
            );
            if (!transaction.amount) {
                localTransactions.splice(index, 1);
                backToTransactions();
            } else {
                backToProducts();
            }
            saveTransactions(localTransactions);
        },
        [localTransactions, saveTransactions]
    );

    const showBoughtProducts = useCallback(
        (index: number, fallback?: () => void) => {
            const transaction = localTransactions?.at(index);
            if (!transaction || !transaction.amount) return;

            openPopup(
                toCurrency(transaction.amount) + ' en ' + transaction.method,
                transaction.products.map(displayProduct),
                fallback ? fallback : undefined,
                true,
                confirmDeleteProduct((i) => {
                    deleteBoughtProduct(
                        i,
                        transaction,
                        () => showBoughtProducts(index, fallback),
                        fallback ? fallback : closePopup
                    );
                })
            );
        },
        [
            localTransactions,
            openPopup,
            closePopup,
            displayProduct,
            confirmDeleteProduct,
            toCurrency,
            deleteBoughtProduct,
        ]
    );

    const showTransactions = useCallback(() => {
        if (!localTransactions?.length) return;

        const totalAmount = localTransactions.reduce((total, transaction) => total + transaction.amount, 0);
        const totalTransactions = localTransactions.length;
        const summary = localTransactions.map(displayTransaction);

        openPopup(
            `${totalTransactions} vente${totalTransactions > 1 ? 's' : ''} : ${toCurrency(totalAmount)}`,
            summary,
            (i) => showBoughtProducts(i, showTransactions),
            true,
            {
                confirmTitle: 'Modifier ?',
                action: (i) => {
                    editTransaction(i);
                    closePopup();
                },
            }
        );
    }, [openPopup, closePopup, localTransactions, editTransaction, displayTransaction, showBoughtProducts, toCurrency]);

    const canDisplayTotal = useMemo(() => {
        return total || amount || selectedCategory || !localTransactions?.length;
    }, [total, amount, selectedCategory, localTransactions]);

    const handleClick = useMemo(() => {
        return canDisplayTotal ? () => showProducts() : localTransactions?.length ? showTransactions : () => {};
    }, [showProducts, showTransactions, canDisplayTotal, localTransactions]);

    const totalDisplay = useMemo(() => {
        return canDisplayTotal ? (
            <div>
                Total : <Amount value={total} showZero />
            </div>
        ) : (
            <span>
                {'Ticket : ' + localTransactions?.length}
                <span className="text-xl">{`vente${(localTransactions?.length ?? 0) > 1 ? 's' : ''}`}</span>
            </span>
        );
    }, [total, localTransactions, canDisplayTotal]);

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
                        ((canDisplayTotal && total) || (!canDisplayTotal && localTransactions?.length)
                            ? ' active:bg-orange-300 '
                            : '')
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
