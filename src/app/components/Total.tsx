'use client';

import { FC, MouseEventHandler, useCallback, useMemo, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { isConfirmedTransaction, isUpdatingTransaction, isWaitingTransaction } from '../contexts/DataProvider';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePay } from '../hooks/usePay';
import { usePopup } from '../hooks/usePopup';
import { useSummary } from '../hooks/useSummary';
import { useWindowParam } from '../hooks/useWindowParam';
import { BACK_KEYWORD, REFUND_KEYWORD, UPDATING_KEYWORD, WAITING_KEYWORD } from '../utils/constants';
import { isMobileDevice, isMobileSize, useIsMobile } from '../utils/mobile';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';
import { Transaction } from '../utils/interfaces';

const payLabel = 'PAYER';
const totalLabel = 'TOTAL';

interface ItemProps {
    className?: string;
    label: string;
    onClick?: () => void;
    onContextMenu: () => void;
}

interface Option {
    label: string;
    action: (index: number) => void;
}

function handleContextMenu(
    title: string,
    options: Option[],
    index: number,
    openPopup: (
        title: string,
        options: string[],
        callback: (index: number, option: string) => void,
        isCloseable: boolean
    ) => void
) {
    if (index >= 0) {
        openPopup(
            title,
            options.map(({ label }) => label),
            (i) => i >= 0 && options[i].action(index),
            true
        );
    }
}

const Item: FC<ItemProps> = ({ label, onClick = () => {}, onContextMenu, className }) => {
    const handleContextMenu = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            onContextMenu();
        },
        [onContextMenu]
    );

    return (
        <div className={className} onClick={onClick} onContextMenu={handleContextMenu}>
            {label}
        </div>
    );
};

export const Total: FC = () => {
    const {
        total,
        getCurrentTotal,
        amount,
        selectedProduct,
        transactions,
        editTransaction,
        deleteTransaction,
        displayTransaction,
        reverseTransaction,
        toCurrency,
        products,
        setSelectedProduct,
        setAmount,
        setQuantity,
        deleteProduct,
        displayProduct,
        updateTransaction,
    } = useData();
    const { showTransactionsSummary, showTransactionsSummaryMenu } = useSummary();
    const { openPopup, closePopup } = usePopup();
    const { pay, printTransaction } = usePay();
    const { isStateReady, getPrintersNames } = useConfig();

    const [needRefresh, setNeedRefresh] = useState(false);

    const label = useIsMobile() ? totalLabel : payLabel;

    // Helper function to edit transaction, reversing refund transactions first
    const editTransactionWithReversal = useCallback(
        (index: number) => {
            const transaction = transactions.at(index);
            if (!transaction) return;

            // If it's a refund transaction, reverse it first
            if (transaction.method === REFUND_KEYWORD) {
                const reversedTransaction = reverseTransaction(transaction);
                // Replace the transaction in the array with the reversed one
                transactions.splice(index, 1, reversedTransaction);
            }

            // Now call editTransaction normally
            editTransaction(index);
        },
        [transactions, reverseTransaction, editTransaction]
    );

    const getTransactionMenu = useCallback(
        (transaction: Transaction | undefined, fallback: (index: number) => void) => {
            if (!transaction || !isStateReady || isUpdatingTransaction(transaction)) return;

            const isWaiting = isWaitingTransaction(transaction);
            return {
                title: 'Transaction',
                options: [
                    {
                        label: isWaiting ? 'Payer' : 'Modifier Paiement',
                        action: (index: number) => {
                            editTransactionWithReversal(index); // set the transaction as current
                            setTimeout(pay, 100);
                        },
                    },
                    {
                        label: isWaiting ? 'Reprendre' : 'Modifier Produits',
                        action: (index: number) => {
                            editTransactionWithReversal(index);
                            closePopup();
                        },
                    },
                ]
                    .concat(
                        getPrintersNames().map((printerName) => ({
                            label: printerName,
                            action: () => printTransaction(printerName, transaction),
                        }))
                    )
                    .concat([
                        {
                            label: 'Effacer',
                            action: (index: number) => {
                                deleteTransaction(index);
                                closePopup();
                            },
                        },
                        {
                            label: 'Annuler',
                            action: (index: number) => fallback(index),
                        },
                    ]),
            };
        },
        [
            editTransactionWithReversal,
            isStateReady,
            deleteTransaction,
            pay,
            printTransaction,
            closePopup,
            getPrintersNames,
        ]
    );

    const selectProduct = useCallback(
        (index: number) => {
            if (!isStateReady && index >= 0) return;

            const newSelectedProduct =
                products.current.at(index) === selectedProduct ? undefined : products.current.at(index);

            setSelectedProduct(newSelectedProduct);
            setAmount(newSelectedProduct?.amount ?? 0);
            setQuantity(newSelectedProduct?.amount ? -1 : 0);
        },
        [products, selectedProduct, setSelectedProduct, isStateReady, setAmount, setQuantity]
    );

    const modifyProduct = useCallback(
        (index: number) => {
            if (!isStateReady && index >= 0) return;

            handleContextMenu(
                'Effacer ?',
                [
                    {
                        label: 'Oui',
                        action: (index) => deleteProduct(index),
                    },
                    {
                        label: 'Non',
                        action: () => closePopup(),
                    },
                ],
                index,
                openPopup
            );
        },
        [deleteProduct, openPopup, closePopup, isStateReady]
    );

    const modifyTransaction = useCallback(
        (index: number, fallback: (index: number) => void) => {
            const transaction = index >= 0 ? transactions.at(index) : undefined;
            const transactionMenu = getTransactionMenu(transaction, fallback);
            if (!transactionMenu) return;

            handleContextMenu(transactionMenu.title, transactionMenu.options, index, openPopup);
        },
        [getTransactionMenu, openPopup, transactions]
    );

    const displayTransactionsTitle = useCallback(() => {
        if (!transactions.length) return '';

        const totalTransactions = transactions.length;
        const currencies: { [key: string]: { amount: number; currency: string } } = {};
        transactions.forEach((transaction) => {
            if (currencies[transaction.currency]) {
                currencies[transaction.currency].amount += transaction.amount;
            } else {
                currencies[transaction.currency] = {
                    amount: transaction.amount,
                    currency: transaction.currency,
                };
            }
        });

        return `${totalTransactions} vente${totalTransactions > 1 ? 's' : ''} : ${Object.values(currencies)
            .map((element) => {
                return `${toCurrency(element)}`;
            })
            .join(' + ')}`;
    }, [toCurrency, transactions]);

    const showProducts = useCallback(() => {
        if (!products.current.length) return;

        openPopup(
            products.current.length + ' produits : ' + toCurrency(getCurrentTotal()),
            products.current.map((product) => displayProduct(product)).concat(['', payLabel]),
            (index, option) => {
                if (option === payLabel) {
                    pay();
                } else if (index >= 0) {
                    closePopup(() => selectProduct(index));
                }
            },
            true,
            (index) => {
                if (index > products.current.length) {
                    pay();
                } else {
                    openPopup(
                        'Effacer ?',
                        ['Oui', 'Non'],
                        (i) => {
                            if (i === 0) {
                                deleteProduct(index);
                                if (products.current.length) {
                                    showProducts();
                                } else {
                                    closePopup();
                                }
                            } else {
                                showProducts();
                            }
                        },
                        true
                    );
                }
            },
            (option) => Boolean(selectedProduct && option === displayProduct(selectedProduct))
        );
    }, [
        getCurrentTotal,
        pay,
        products,
        openPopup,
        closePopup,
        displayProduct,
        deleteProduct,
        toCurrency,
        selectProduct,
        selectedProduct,
    ]);

    const deleteBoughtProduct = useCallback(
        (
            productIndex: number,
            transactionIndex: number,
            transaction: Transaction,
            backToProducts: () => void,
            backToTransactions: () => void
        ) => {
            if (!transactions.length) return;

            transaction.products.splice(productIndex, 1);
            transaction.amount = transaction.products.reduce(
                (total, product) => total + product.amount * product.quantity,
                0
            );
            if (!transaction.amount) {
                deleteTransaction(transactionIndex);
                if (transactions.length) {
                    backToTransactions();
                } else {
                    closePopup();
                }
                setNeedRefresh(true);
            } else {
                updateTransaction(transaction);
                backToProducts();
            }
        },
        [transactions, closePopup, updateTransaction, deleteTransaction]
    );

    const showBoughtProducts = useCallback(
        (transactionIndex: number, fallback: () => void) => {
            const transaction = transactionIndex >= 0 ? transactions.at(transactionIndex) : undefined;
            if (isUpdatingTransaction(transaction) || !transaction?.amount || !isStateReady) return;

            openPopup(
                toCurrency(transaction) + ' en ' + transaction.method,
                transaction.products
                    .map((product) => displayProduct(product, transaction.currency))
                    .concat(isMobileSize() ? ['', BACK_KEYWORD] : []),
                (i, o) =>
                    o === BACK_KEYWORD
                        ? fallback()
                        : modifyTransaction(i !== -1 ? transactionIndex : i, (i) => showBoughtProducts(i, fallback)),
                true,
                (productIndex) => {
                    openPopup(
                        'Effacer ?',
                        ['Oui', 'Non'],
                        (i) => {
                            if (i === 0) {
                                deleteBoughtProduct(
                                    productIndex,
                                    transactionIndex,
                                    transaction,
                                    () => showBoughtProducts(transactionIndex, fallback),
                                    fallback
                                );
                            } else {
                                showBoughtProducts(transactionIndex, fallback);
                            }
                        },
                        true
                    );
                }
            );
        },
        [transactions, openPopup, displayProduct, toCurrency, modifyTransaction, isStateReady, deleteBoughtProduct]
    );

    const sortedTransactions = useMemo(() => {
        if (!transactions.length) return [];

        const waitingTransactions = transactions
            .filter(isWaitingTransaction)
            .sort((a, b) => b.createdDate - a.createdDate);
        const confirmedTransactions = transactions
            .filter(isConfirmedTransaction)
            .sort((a, b) => b.createdDate - a.createdDate);
        const hasSeparation = waitingTransactions.length && confirmedTransactions.length;
        return waitingTransactions.concat(hasSeparation ? [{} as Transaction] : []).concat(confirmedTransactions);
    }, [transactions]);

    const getTransactionIndex = useCallback(
        (index: number) =>
            transactions.findIndex((transaction) => transaction.createdDate === sortedTransactions[index]?.createdDate),
        [sortedTransactions, transactions]
    );

    const showTransactions = useCallback(() => {
        if (!transactions.length) return;

        openPopup(
            displayTransactionsTitle(),
            sortedTransactions.map(displayTransaction),
            (i) => showBoughtProducts(getTransactionIndex(i), showTransactions),
            true,
            (index) => {
                const transactionMenu = getTransactionMenu(sortedTransactions.at(index), () => showTransactions());
                if (!transactionMenu) return;

                openPopup(
                    transactionMenu.title,
                    transactionMenu.options.map(({ label }) => label),
                    (i) => {
                        if (i >= 0) {
                            transactionMenu.options[i].action(index);
                        }
                    }
                );
            },
            (option) => option.includes(WAITING_KEYWORD) || option.includes(UPDATING_KEYWORD)
        );
    }, [
        openPopup,
        transactions,
        displayTransaction,
        showBoughtProducts,
        displayTransactionsTitle,
        getTransactionIndex,
        sortedTransactions,
        getTransactionMenu,
    ]);

    const canDisplayTotal = useMemo(() => {
        setNeedRefresh(false);
        return Boolean(needRefresh || total || amount || selectedProduct || !transactions.length);
    }, [total, amount, selectedProduct, transactions, needRefresh]);

    const handleClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();

            if (!isStateReady) return;

            if (canDisplayTotal) {
                if (isMobileSize()) {
                    showProducts();
                } else {
                    pay();
                }
            } else if (transactions.length) {
                if (isMobileSize()) {
                    showTransactions();
                } else {
                    if (e.type === 'click') {
                        showTransactionsSummary(showTransactionsSummaryMenu);
                    } else {
                        showTransactionsSummaryMenu();
                    }
                }
            }
        },
        [
            showProducts,
            showTransactions,
            canDisplayTotal,
            transactions,
            pay,
            showTransactionsSummary,
            showTransactionsSummaryMenu,
            isStateReady,
        ]
    );

    const clickClassName = twMerge(
        'active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark active:dark:text-popup-light',
        isStateReady && !isMobileDevice() ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : ''
    );

    const { width: screenWidth, height: screenHeight } = useWindowParam();
    const left = useMemo(() => (!isMobileSize() && screenWidth > 0 ? screenWidth / 2 : 0), [screenWidth]);
    const height = useMemo(() => (!isMobileSize() && screenHeight > 0 ? screenHeight - 76 : 0), [screenHeight]);

    return (
        <div
            className={useAddPopupClass(
                'inset-x-0 h-[75px] md:absolute md:left-1/2 md:h-full md:border-l-4 overflow-y-auto ' +
                    'md:border-secondary-active-light md:dark:border-secondary-active-dark '
            )}
        >
            <div
                className={twMerge(
                    'md:w-1/2 w-full fixed text-5xl truncate text-center font-bold py-3',
                    'border-b-4 border-active-light dark:border-active-dark',
                    (canDisplayTotal && total) || (!canDisplayTotal && transactions.length) ? clickClassName : '',
                    useIsMobile() ? 'md:hidden' : 'hidden md:block'
                )}
                onClick={handleClick}
                onContextMenu={handleClick}
            >
                {canDisplayTotal ? (
                    <div>
                        {canDisplayTotal && total ? label : totalLabel} <Amount value={total} showZero />
                    </div>
                ) : (
                    <span>
                        {'Ticket : ' + transactions.length}
                        <span className="text-xl">{`vente${(transactions.length ?? 0) > 1 ? 's' : ''}`}</span>
                    </span>
                )}
            </div>

            <div
                className={
                    'md:w-1/2 fixed top-[76px] left-0 w-1/2 text-center text-2xl ' +
                    'font-bold hidden md:flex md:flex-col'
                }
                style={{ left: left, height: height }}
            >
                <div className="flex-1 overflow-y-auto">
                    {canDisplayTotal
                        ? products.current
                              .map((product) => ({
                                  product: displayProduct(product),
                                  isSelectedProduct: product === selectedProduct,
                              }))
                              .map(({ product, isSelectedProduct }, index) => (
                                  <Item
                                      className={twMerge(
                                          'py-2 ml-1',
                                          clickClassName,
                                          isSelectedProduct ? 'animate-pulse' : ''
                                      )}
                                      key={index}
                                      label={product}
                                      onClick={() => selectProduct(index)}
                                      onContextMenu={() => modifyProduct(index)}
                                  />
                              ))
                        : sortedTransactions
                              .map((transaction) => ({
                                  transaction: displayTransaction(transaction),
                                  isWaitingTransaction: isWaitingTransaction(transaction),
                                  isUpdatingTransaction: isUpdatingTransaction(transaction),
                              }))
                              .map(({ transaction, isWaitingTransaction, isUpdatingTransaction }, index) =>
                                  transaction ? (
                                      <Item
                                          className={twMerge(
                                              'py-2 ml-1',
                                              isWaitingTransaction || isUpdatingTransaction ? 'animate-pulse' : '',
                                              isUpdatingTransaction ? 'cursor-not-allowed' : clickClassName
                                          )}
                                          key={index}
                                          label={transaction}
                                          onClick={() =>
                                              showBoughtProducts(getTransactionIndex(index), () => closePopup())
                                          }
                                          onContextMenu={() =>
                                              modifyTransaction(getTransactionIndex(index), () => closePopup())
                                          }
                                      />
                                  ) : (
                                      <div
                                          key={index}
                                          className="border-b-2 border-secondary-active-light dark:border-secondary-active-dark"
                                      />
                                  )
                              )}
                </div>
                {!canDisplayTotal && (
                    <div className="flex-shrink-0 pt-1 border-t-4 border-secondary-active-light dark:border-secondary-active-dark bg-primary-light dark:bg-primary-dark">
                        {displayTransactionsTitle()}
                    </div>
                )}
            </div>
        </div>
    );
};
