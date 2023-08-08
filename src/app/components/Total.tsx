'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Currency } from '../hooks/useConfig';
import { Transaction, useData } from '../hooks/useData';
import { usePay } from '../hooks/usePay';
import { usePopup } from '../hooks/usePopup';
import { requestFullscreen } from '../utils/fullscreen';
import { isMobileSize, useIsMobile } from '../utils/mobile';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';

const payLabel = 'PAYER';

export const Total: FC = () => {
    const {
        total,
        getCurrentTotal,
        amount,
        products,
        selectedCategory,
        addProduct,
        deleteProduct,
        displayProduct,
        transactions,
        saveTransactions,
        editTransaction,
        toCurrency,
    } = useData();
    const { openPopup, closePopup } = usePopup();
    const { Pay } = usePay();

    // Hack to avoid differences between the server and the client, generating hydration issues
    const [localTransactions, setLocalTransactions] = useState<[Transaction] | undefined>();
    useEffect(() => {
        setLocalTransactions(transactions);
    }, [transactions]);

    const displayTransaction = useCallback(
        (transaction: Transaction) => {
            return (
                toCurrency(transaction.amount, transaction.currency) +
                ' en ' +
                transaction.method +
                ' à ' +
                transaction.date
            );
        },
        [toCurrency]
    );

    const showProducts = useCallback(
        (newAmount = amount) => {
            if (newAmount && selectedCategory) {
                addProduct(selectedCategory);
            }
            if (!isMobileSize()) {
                Pay();
            }
            if (!products.current?.length || !isMobileSize()) return;

            openPopup(
                products.current.length + ' produits : ' + toCurrency(getCurrentTotal(), products.current[0].currency),
                products.current.map(displayProduct).concat(['', payLabel]),
                (_, option) => {
                    if (option === payLabel) {
                        Pay();
                    }
                },
                true,
                {
                    confirmTitle: 'Effacer ?',
                    maxIndex: products.current.length,
                    action: (i) => {
                        if (!products.current?.at(i)) {
                            Pay();
                        } else {
                            deleteProduct(i);
                            if (products.current?.length) {
                                showProducts(0);
                            } else {
                                closePopup();
                            }
                        }
                    },
                }
            );
        },
        [
            getCurrentTotal,
            amount,
            addProduct,
            Pay,
            selectedCategory,
            products,
            openPopup,
            closePopup,
            displayProduct,
            deleteProduct,
            toCurrency,
        ]
    );

    const deleteBoughtProduct = useCallback(
        (
            productIndex: number,
            transactionIndex: number,
            transaction: Transaction,
            backToProducts: () => void,
            backToTransactions: () => void
        ) => {
            if (!localTransactions?.length) return;

            transaction.products.splice(productIndex, 1);
            transaction.amount = transaction.products.reduce(
                (total, product) => total + product.amount * product.quantity,
                0
            );
            if (!transaction.amount) {
                localTransactions.splice(transactionIndex, 1);
                if (localTransactions.length) {
                    backToTransactions();
                } else {
                    closePopup();
                }
            } else {
                backToProducts();
            }
            saveTransactions(localTransactions);
        },
        [localTransactions, saveTransactions, closePopup]
    );

    const showBoughtProducts = useCallback(
        (index: number, fallback?: () => void) => {
            const transaction = localTransactions?.at(index);
            if (!transaction || !transaction.amount || index < 0) return;

            openPopup(
                toCurrency(transaction.amount, transaction.currency) + ' en ' + transaction.method,
                transaction.products.map(displayProduct),
                fallback ? fallback : undefined,
                true,
                {
                    confirmTitle: 'Effacer ?',
                    action: (i) => {
                        deleteBoughtProduct(
                            i,
                            index,
                            transaction,
                            () => showBoughtProducts(index, fallback),
                            fallback ? fallback : closePopup
                        );
                    },
                }
            );
        },
        [localTransactions, openPopup, closePopup, displayProduct, toCurrency, deleteBoughtProduct]
    );

    const showTransactions = useCallback(() => {
        if (!localTransactions?.length || !isMobileSize()) return;

        const totalTransactions = localTransactions.length;
        const summary = localTransactions.map(displayTransaction);
        const currencies: { [key: string]: { amount: number; currency: Currency } } = {};
        localTransactions.forEach((transaction) => {
            if (currencies[transaction.currency.symbol]) {
                currencies[transaction.currency.symbol].amount += transaction.amount;
            } else {
                currencies[transaction.currency.symbol] = {
                    amount: transaction.amount,
                    currency: transaction.currency,
                };
            }
        });

        openPopup(
            `${totalTransactions} vente${totalTransactions > 1 ? 's' : ''} : ${Object.values(currencies)
                .map((currency) => {
                    return `${toCurrency(currency.amount, currency.currency)}`;
                })
                .join(' + ')}`,
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
        return (total || amount || selectedCategory || !localTransactions?.length) as boolean;
    }, [total, amount, selectedCategory, localTransactions]);

    const handleClick = useCallback(() => {
        requestFullscreen();
        if (canDisplayTotal) {
            showProducts();
        } else if (localTransactions?.length) {
            showTransactions();
        }
    }, [showProducts, showTransactions, canDisplayTotal, localTransactions]);

    const totalDisplayClassName =
        'text-5xl truncate text-center font-bold py-3 ' +
        (useIsMobile()
            ? 'md:hidden border-b-[3px] border-active-light dark:border-active-dark ' +
              ((canDisplayTotal && total) || (!canDisplayTotal && localTransactions?.length)
                  ? 'active:bg-active-light dark:active:bg-active-dark '
                  : '')
            : 'hidden border-b-[3px] border-active-light dark:border-active-dark md:block');

    return (
        <div
            className={useAddPopupClass(
                'inset-x-0 h-[75px] md:absolute md:left-1/2 md:h-full md:border-l-4 ' +
                    'md:border-secondary-active-light md:dark:border-secondary-active-dark'
            )}
        >
            <div
                className={totalDisplayClassName}
                onClick={handleClick}
                onContextMenu={(e) => {
                    e.preventDefault();
                    handleClick();
                }}
            >
                {canDisplayTotal ? (
                    <div>
                        Total : <Amount value={total} showZero />
                    </div>
                ) : (
                    <span>
                        {'Ticket : ' + localTransactions?.length}
                        <span className="text-xl">{`vente${(localTransactions?.length ?? 0) > 1 ? 's' : ''}`}</span>
                    </span>
                )}
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
    );
};
