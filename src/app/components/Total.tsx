'use client';

import { FC, MouseEventHandler, useCallback, useMemo, useState } from 'react';
import { Currency, State, useConfig } from '../hooks/useConfig';
import { Transaction, useData } from '../hooks/useData';
import { usePay } from '../hooks/usePay';
import { usePopup } from '../hooks/usePopup';
import { useSummary } from '../hooks/useSummary';
import { useWindowParam } from '../hooks/useWindowParam';
import { BACK_KEYWORD } from '../utils/constants';
import { isMobileSize, useIsMobile } from '../utils/mobile';
import { Amount } from './Amount';
import { useAddPopupClass } from './Popup';

const payLabel = 'PAYER';
const totalLabel = 'TOTAL';

interface ItemProps {
    className?: string;
    label: string;
    onClick?: () => void;
    onContextMenu: () => void;
}

function handleContextMenu(
    question: string,
    action: (index: number) => void,
    index: number,
    openPopup: (
        title: string,
        options: string[],
        callback: (index: number, option: string) => void,
        stayOpen: boolean
    ) => void,
    closePopup: () => void,
    fallback: (index: number) => void = closePopup
) {
    if (index >= 0) {
        openPopup(
            question + ' ?',
            ['Oui', 'Non'],
            (i) => {
                switch (i) {
                    case 0:
                        action(index);
                        closePopup();
                        break;

                    case 1:
                        fallback(index);
                        break;
                }
            },
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
        products,
        selectedProduct,
        deleteProduct,
        displayProduct,
        transactions,
        editTransaction,
        updateTransaction,
        deleteTransaction,
        toCurrency,
        displayTransaction,
        isWaitingTransaction,
        isDeletedTransaction,
        setSelectedProduct,
        setAmount,
        setQuantity,
    } = useData();
    const { showTransactionsSummary, showTransactionsSummaryMenu } = useSummary();
    const { openPopup, closePopup } = usePopup();
    const { pay } = usePay();
    const { isStateReady } = useConfig();

    const [needRefresh, setNeedRefresh] = useState(false);

    const label = useIsMobile() ? totalLabel : payLabel;

    const selectProduct = useCallback(
        (index: number) => {
            if (!isStateReady) return;

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
            if (!isStateReady) return;

            handleContextMenu('Effacer', deleteProduct, index, openPopup, closePopup);
        },
        [deleteProduct, openPopup, closePopup, isStateReady]
    );

    const modifyTransaction = useCallback(
        (index: number, fallback: (index: number) => void) => {
            if (!isStateReady) return;

            handleContextMenu(
                isWaitingTransaction(transactions.at(index)) ? 'Reprendre' : 'Modifier',
                editTransaction,
                index,
                openPopup,
                closePopup,
                () => fallback(index)
            );
        },
        [editTransaction, openPopup, transactions, isWaitingTransaction, closePopup, isStateReady]
    );

    const isConfirmedTransaction = useCallback(
        (transaction?: Transaction) => {
            return transaction && !isWaitingTransaction(transaction);
        },
        [isWaitingTransaction]
    );

    const displayTransactionsTitle = useCallback(() => {
        if (!transactions.length) return '';

        const totalTransactions = transactions.length;
        const currencies: { [key: string]: { amount: number; currency: Currency } } = {};
        transactions.forEach((transaction) => {
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
            const transaction = transactions.at(transactionIndex);
            if (!transaction || !transaction.amount || transactionIndex < 0 || !isStateReady) return;

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

    const showTransactions = useCallback(() => {
        if (!transactions.length) return;

        const waitingTransactions = transactions.filter(isWaitingTransaction);
        const confirmedTransactions = transactions.filter(isConfirmedTransaction);
        const hasSeparation = waitingTransactions.length && confirmedTransactions.length;
        const getIndex = (i: number) => (i > waitingTransactions.length && waitingTransactions.length ? i - 1 : i);
        const summary = waitingTransactions
            .map(displayTransaction)
            .concat(hasSeparation ? [''] : [])
            .concat(confirmedTransactions.map(displayTransaction));
        openPopup(
            displayTransactionsTitle(),
            summary,
            (i) => showBoughtProducts(getIndex(i), showTransactions),
            true,
            (index) => {
                openPopup(
                    isWaitingTransaction(transactions.at(index)) ? 'Reprendre ?' : 'Modifier ?',
                    ['Oui', 'Non'],
                    (i) => {
                        if (i === 0) {
                            editTransaction(getIndex(index));
                            closePopup();
                        } else {
                            showTransactions();
                        }
                    },
                    true
                );
            }
        );
    }, [
        openPopup,
        transactions,
        displayTransaction,
        showBoughtProducts,
        displayTransactionsTitle,
        isWaitingTransaction,
        isConfirmedTransaction,
        editTransaction,
        closePopup,
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

    const clickClassName = isStateReady ? 'active:bg-active-light dark:active:bg-active-dark ' : '';

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
                className={
                    'md:w-1/2 w-full fixed text-5xl truncate text-center font-bold py-3 ' +
                    ((canDisplayTotal && total) || (!canDisplayTotal && transactions.length) ? clickClassName : '') +
                    (useIsMobile()
                        ? 'md:hidden border-b-[3px] border-active-light dark:border-active-dark'
                        : 'hidden border-b-[3px] border-active-light dark:border-active-dark md:block')
                }
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
                    'md:w-1/2 fixed top-[76px] left-0 w-1/2 h-screen text-center text-2xl ' +
                    'py-1 font-bold overflow-y-auto hidden md:block'
                }
                style={{ left: left, height: height }}
            >
                {canDisplayTotal
                    ? products.current
                          .map((product) => {
                              return {
                                  product: displayProduct(product),
                                  isSelectedProduct: product === selectedProduct,
                              };
                          })
                          .map(({ product, isSelectedProduct }, index) => (
                              <Item
                                  className={clickClassName + 'py-2 ' + (isSelectedProduct ? 'animate-pulse' : '')}
                                  key={index}
                                  label={product}
                                  onClick={() => selectProduct(index)}
                                  onContextMenu={() => modifyProduct(index)}
                              />
                          ))
                    : transactions
                          .filter((transaction) => !isDeletedTransaction(transaction))
                          .sort((a, b) => b.createdDate - a.createdDate)
                          .map(displayTransaction)
                          .map((transaction, index) => (
                              <Item
                                  className={
                                      clickClassName +
                                      'py-2 ' +
                                      (isWaitingTransaction(transactions.at(index))
                                          ? (isConfirmedTransaction(transactions.at(index + 1))
                                                ? 'mb-3 pb-3 border-b-4 border-active-light dark:border-active-dark '
                                                : '') + 'animate-pulse'
                                          : '')
                                  }
                                  key={index}
                                  label={transaction}
                                  onClick={() => showBoughtProducts(index, () => closePopup())}
                                  onContextMenu={() => modifyTransaction(index, () => closePopup())}
                              />
                          ))
                          .concat(
                              <div
                                  key="total"
                                  className={
                                      'mt-3 pt-1 border-t-4 border-secondary-active-light dark:border-secondary-active-dark'
                                  }
                              >
                                  {displayTransactionsTitle()}
                              </div>
                          )}
            </div>
        </div>
    );
};
