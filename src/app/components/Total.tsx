'use client';

import { FC, MouseEventHandler, useCallback, useEffect, useMemo, useState } from 'react';
import { Currency } from '../hooks/useConfig';
import { Transaction, useData } from '../hooks/useData';
import { usePay } from '../hooks/usePay';
import { usePopup } from '../hooks/usePopup';
import { useSummary } from '../hooks/useSummary';
import { requestFullscreen } from '../utils/fullscreen';
import { isMobileSize, useIsMobile } from '../utils/mobile';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';

const payLabel = 'PAYER';
const totalLabel = 'TOTAL';

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
        toMercurial,
        quantity,
    } = useData();
    const { showTransactionsSummary, showTransactionsSummaryMenu } = useSummary();
    const { openPopup, closePopup } = usePopup();
    const { pay } = usePay();

    // Hack to avoid differences between the server and the client, generating hydration issues
    const [localTransactions, setLocalTransactions] = useState<Transaction[] | undefined>();
    useEffect(() => {
        setLocalTransactions(transactions);
    }, [transactions]);

    const label = useIsMobile() ? totalLabel : payLabel;

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

    const displayTransactionsTitle = useMemo(() => {
        if (!localTransactions?.length) return '';

        const totalTransactions = localTransactions.length;
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

        return `${totalTransactions} vente${totalTransactions > 1 ? 's' : ''} : ${Object.values(currencies)
            .map((currency) => {
                return `${toCurrency(currency.amount, currency.currency)}`;
            })
            .join(' + ')}`;
    }, [toCurrency, localTransactions]);

    const showProducts = useCallback(() => {
        if (!products.current?.length) return;

        openPopup(
            products.current.length + ' produits : ' + toCurrency(getCurrentTotal(), products.current[0].currency),
            products.current.map(displayProduct).concat(['', payLabel]),
            (_, option) => {
                if (option === payLabel) {
                    pay();
                }
            },
            true,
            {
                confirmTitle: 'Effacer ?',
                maxIndex: products.current.length,
                action: (i) => {
                    if (!products.current?.at(i)) {
                        pay();
                    } else {
                        deleteProduct(i);
                        if (products.current?.length) {
                            showProducts();
                        } else {
                            closePopup();
                        }
                    }
                },
            }
        );
    }, [getCurrentTotal, pay, products, openPopup, closePopup, displayProduct, deleteProduct, toCurrency]);

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
        if (!localTransactions?.length) return;

        const summary = localTransactions.map(displayTransaction);

        openPopup(displayTransactionsTitle, summary, (i) => showBoughtProducts(i, showTransactions), true, {
            confirmTitle: 'Modifier ?',
            action: (i) => {
                editTransaction(i);
                closePopup();
            },
        });
    }, [
        openPopup,
        closePopup,
        localTransactions,
        editTransaction,
        displayTransaction,
        showBoughtProducts,
        displayTransactionsTitle,
    ]);

    const canDisplayTotal = useMemo(() => {
        return (total || amount || selectedCategory || !localTransactions?.length) as boolean;
    }, [total, amount, selectedCategory, localTransactions]);

    const handleClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            requestFullscreen();
            if (canDisplayTotal) {
                if (amount && selectedCategory) {
                    addProduct(selectedCategory);
                }
                if (isMobileSize()) {
                    showProducts();
                } else {
                    pay();
                }
            } else if (localTransactions?.length) {
                if (isMobileSize()) {
                    showTransactions();
                } else {
                    if (e.type === 'click') {
                        showTransactionsSummary();
                    } else {
                        showTransactionsSummaryMenu(e);
                    }
                }
            }
        },
        [
            showProducts,
            showTransactions,
            canDisplayTotal,
            localTransactions,
            pay,
            addProduct,
            amount,
            selectedCategory,
            showTransactionsSummary,
            showTransactionsSummaryMenu,
        ]
    );

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
            <div className={totalDisplayClassName} onClick={handleClick} onContextMenu={handleClick}>
                {canDisplayTotal ? (
                    <div>
                        {label} <Amount value={total + amount * Math.max(toMercurial(quantity), 1)} showZero />
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
                    : localTransactions
                          ?.map(displayTransaction)
                          .map((transaction, index) => (
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
                          .concat(
                              <div
                                  key="total"
                                  className={
                                      'mt-3 pt-1 border-t-4 border-secondary-active-light dark:border-secondary-active-dark'
                                  }
                              >
                                  {displayTransactionsTitle}
                              </div>
                          )}
            </div>
        </div>
    );
};
