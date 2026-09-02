'use client';

import { IconReceipt, IconWallet } from '@tabler/icons-react';
import TopNav from '@/app/components/admin/TopNav';
import { useUserRole } from '@/app/hooks/useUserRole';
import { FC, MouseEventHandler, useCallback, useMemo, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import {
    isConfirmedTransaction,
    isDeletedTransaction,
    isProcessingTransaction,
    isRefundTransaction,
    isUpdatingTransaction,
    isWaitingTransaction,
} from '../contexts/dataProvider/transactionHelpers';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePay } from '../hooks/usePay';
import { usePopup } from '../hooks/usePopup';
import { useSummary } from '../hooks/useSummary';
import { useWindowParam } from '../hooks/useWindowParam';
import Loading from '../loading';
import {
    BACK_KEYWORD,
    DEBIT_KEYWORD,
    PRINT_KEYWORD,
    PRINT_NO_DETAIL,
    PRINT_WITH_DETAIL,
    PROVISION_KEYWORD,
    REFUND_KEYWORD,
    UPDATING_KEYWORD,
    USE_FIDELITY_KEYWORD,
    WAITING_KEYWORD,
} from '../utils/constants';
import { OrderItem, Product, State, Transaction } from '../utils/interfaces';
import { isMobileSize, useIsMobile, useIsMobileDevice, useLongPressContextMenu } from '../utils/mobile';
import { getPaymentIcon } from '../utils/paymentIcons';
import { getPublicKey } from '../utils/processData';
import { Amount } from './Amount';
import { OrderItemsSelector } from './OrderItemsSelector';
import { useAddPopupClass } from './Popup';

// Wrapper component to conditionally render TopNav based on user role
function TopNavWithRoleCheck({
    showLightAdminNav,
    isMobile,
    onCollapsedChange,
}: {
    showLightAdminNav?: boolean;
    isMobile?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
}) {
    const { isCashier } = useUserRole();
    // Only show TopNav if user has admin or cashier access (they have accessible admin pages)
    if (!showLightAdminNav || !isMobile || !isCashier) return null;
    return (
        <div
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            // The parent top bar now handles click/context-menu for pay/ticket,
            // so a long-press on the nav must not bubble up and open it.
            onContextMenu={(e) => e.stopPropagation()}
        >
            <TopNav inline onCollapsedChange={onCollapsedChange} />
        </div>
    );
}

const payLabel = 'Payer';
const totalLabel = 'Total';

function findCompanyProductIndex(
    productList: Product[],
    categories: { name: string; company?: string | null }[],
    company?: string | null
): number {
    if (!company) return -1;
    return productList.findIndex((product) => categories.find((c) => c.name === product.category)?.company === company);
}

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

    const longPressHandlers = useLongPressContextMenu(onContextMenu);

    const lines = label.split('\n');
    return (
        <div
            className={twMerge('text-left pl-3', className)}
            onClick={onClick}
            onContextMenu={handleContextMenu}
            {...longPressHandlers}
        >
            {lines.map((line, i) => (
                <div key={i}>{line}</div>
            ))}
        </div>
    );
};

// A single payment-method icon button for the desktop icon bar.
const PaymentIconButton: FC<{
    icon: FC<{ size?: number | string; className?: string }>;
    label: string;
    onClick: () => void;
    size: number;
    disabled?: boolean;
    className?: string;
}> = ({ icon: Icon, label, onClick, size, disabled, className }) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        disabled={disabled}
        onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onClick();
        }}
        onContextMenu={(e) => e.stopPropagation()}
        className={twMerge(
            'inline-flex items-center justify-center h-full aspect-square p-0 rounded-none transition-colors',
            disabled
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-active-light dark:hover:bg-active-dark active:bg-secondary-active-light dark:active:bg-secondary-active-dark',
            className
        )}
    >
        <Icon size={size} />
    </button>
);

export const Total: FC<{ showLightAdminNav?: boolean; compact?: boolean }> = ({
    showLightAdminNav = false,
    compact = false,
}) => {
    const isMobileDevice = useIsMobileDevice();
    const [navExpanded, setNavExpanded] = useState(false);
    const {
        total,
        employerShare,
        getEmployerShare,
        getCurrentTotal,
        amount,
        selectedProduct,
        currentCustomer,
        transactions,
        editTransaction,
        refundTransaction,
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
        transactionsLoaded,
        orderId,
        setSelectedOrderItems,
        setPartialPaymentAmount,
        showPartialPaymentSelector,
        setShowPartialPaymentSelector,
    } = useData();
    const { showTransactionsSummary, showTransactionsSummaryMenu } = useSummary();
    const { openPopup, closePopup } = usePopup();
    const {
        pay,
        printTransaction,
        printKitchenReceipt,
        payWithMethod,
        canAddProvision,
        payProvisionWithMethod,
        applyFidelity,
    } = usePay();
    const {
        state,
        isStateReady,
        hasCashierPrinter,
        parameters,
        paymentMethods,
        currencies,
        currencyIndex,
        categories,
    } = useConfig();

    const [needRefresh, setNeedRefresh] = useState(false);
    const visibleTransactions = useMemo(() => transactions.filter((tx) => !isDeletedTransaction(tx)), [transactions]);

    const label = useIsMobile() ? totalLabel : payLabel;

    // PROCESSING transactions are editable only by the device that created them.
    // Other devices/users can view/print but not modify, delete, or refund them.
    const isReadOnlyProcessingForUser = useCallback(
        (transaction: Transaction) => {
            if (!isProcessingTransaction(transaction)) return false;
            const currentDeviceId = getPublicKey();
            if (transaction.deviceId) return transaction.deviceId !== currentDeviceId;
            return transaction.validator !== parameters.user?.name;
        },
        [parameters.user?.name]
    );

    // Helper function to edit transaction, reversing refund transactions first
    const editTransactionWithReversal = useCallback(
        (index: number) => {
            const transaction = transactions.at(index);
            if (!transaction) return;

            // If it's a refund transaction, reverse it first and pass the reversed
            // version directly to editTransaction — no in-place array mutation.
            if (isRefundTransaction(transaction)) {
                const reversedTransaction = reverseTransaction(transaction);
                editTransaction(index, reversedTransaction);
                return;
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
            // PROCESSING transactions are editable only by the user who created them.
            // Other users can see/print but not modify, delete, or refund them.
            const isReadOnly = isReadOnlyProcessingForUser(transaction);

            const editOptions = isReadOnly
                ? []
                : [
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
                  ];

            const deleteAndRefundOptions = isReadOnly
                ? []
                : [
                      {
                          label: 'Effacer',
                          action: (index: number) => {
                              openPopup('⚠️ Confirmer la suppression ?', ['Continuer', 'Annuler'], (i, option) => {
                                  if (option !== 'Continuer') return;
                                  const tx = transactions.at(index);
                                  deleteTransaction(index);
                                  closePopup();
                                  if (tx) {
                                      printKitchenReceipt(tx).then((response) => {
                                          if (!response.success)
                                              console.error('[Delete] Kitchen print failed:', response.error);
                                      });
                                  }
                              });
                          },
                      },
                  ].concat(
                      !isWaiting && !isRefundTransaction(transaction) && parameters.display?.showRefund !== false
                          ? [
                                { label: '', action: () => {} },
                                {
                                    label: REFUND_KEYWORD,
                                    action: (index: number) => {
                                        const refundTx = refundTransaction(index);
                                        closePopup();
                                        if (refundTx) {
                                            printKitchenReceipt(refundTx).then((response) => {
                                                if (!response.success)
                                                    console.error('[Refund] Kitchen print failed:', response.error);
                                            });
                                            printTransaction(refundTx, true);
                                        }
                                    },
                                },
                            ]
                          : []
                  );

            return {
                title: 'Transaction',
                options: [
                    ...editOptions,
                    ...(hasCashierPrinter()
                        ? [
                              {
                                  label: PRINT_KEYWORD + PRINT_NO_DETAIL,
                                  action: () => {
                                      closePopup(() => {
                                          openPopup(
                                              'Nombre de repas',
                                              ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Annuler'],
                                              (idx, opt) => {
                                                  if (idx < 0 || opt === 'Annuler') {
                                                      closePopup();
                                                      return;
                                                  }
                                                  const mealCount = parseInt(opt, 10) || 1;
                                                  printTransaction(transaction, false, mealCount);
                                                  closePopup();
                                              }
                                          );
                                      });
                                  },
                              },
                              {
                                  label: PRINT_KEYWORD + PRINT_WITH_DETAIL,
                                  action: () => printTransaction(transaction, true),
                              },
                          ]
                        : []),
                    ...deleteAndRefundOptions,
                    {
                        label: 'Annuler',
                        action: (index: number) => fallback(index),
                    },
                ],
            };
        },
        [
            editTransactionWithReversal,
            isStateReady,
            deleteTransaction,
            pay,
            printTransaction,
            printKitchenReceipt,
            openPopup,
            closePopup,
            hasCashierPrinter,
            transactions,
            refundTransaction,
            isReadOnlyProcessingForUser,
            parameters.display?.showRefund,
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
                        action: (index) => {
                            deleteProduct(index);
                            closePopup();
                        },
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
        if (!visibleTransactions.length) return '';

        const totalTransactions = visibleTransactions.reduce(
            (count, tx) => count + (isRefundTransaction(tx) ? -1 : 1),
            0
        );
        const currencies: { [key: string]: { amount: number; currency: string } } = {};
        visibleTransactions.forEach((transaction) => {
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
    }, [toCurrency, visibleTransactions]);

    const showProducts = useCallback(() => {
        if (!products.current.length) return;

        const printerOptions = hasCashierPrinter() ? [PRINT_KEYWORD] : [];

        const productLines = products.current.map((product) => displayProduct(product));
        const showProductsCompanyIndex = findCompanyProductIndex(
            products.current,
            categories,
            currentCustomer?.company
        );
        const liveEmployerShare = getEmployerShare();
        if (liveEmployerShare > 0 && showProductsCompanyIndex >= 0) {
            productLines[showProductsCompanyIndex] += '\n- quote part employeur = ' + toCurrency(liveEmployerShare);
        }

        openPopup(
            products.current.length + ' produits : ' + toCurrency(Math.max(0, getCurrentTotal() - liveEmployerShare)),
            productLines.concat(printerOptions).concat(['', payLabel.toUpperCase()]),
            (index, option) => {
                if (option === payLabel.toUpperCase()) {
                    pay();
                } else if (printerOptions.includes(option)) {
                    // Handle print option - create a temporary transaction to print
                    printTransaction(undefined, true);
                } else if (index >= 0) {
                    closePopup(() => selectProduct(index));
                }
            },
            true,
            (index) => {
                const totalOptions = products.current.length + printerOptions.length + 1; // +1 for empty line
                if (index >= totalOptions) {
                    pay();
                } else if (index < products.current.length) {
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
        pay,
        products,
        openPopup,
        closePopup,
        displayProduct,
        deleteProduct,
        toCurrency,
        selectProduct,
        selectedProduct,
        hasCashierPrinter,
        printTransaction,
        getEmployerShare,
        getCurrentTotal,
        currentCustomer,
        categories,
    ]);

    const deleteBoughtProduct = useCallback(
        (
            productIndex: number,
            transactionIndex: number,
            transaction: Transaction,
            backToProducts: () => void,
            backToTransactions: () => void
        ) => {
            if (!visibleTransactions.length) return;

            const updatedProducts = transaction.products.filter((_, i) => i !== productIndex);
            const updatedAmount = updatedProducts.reduce(
                (total, product) => total + product.amount * product.quantity,
                0
            );
            const updatedTransaction = { ...transaction, products: updatedProducts, amount: updatedAmount };
            if (!updatedAmount) {
                deleteTransaction(transactionIndex);
                if (visibleTransactions.length) {
                    backToTransactions();
                } else {
                    closePopup();
                }
                setNeedRefresh(true);
            } else {
                updateTransaction(updatedTransaction);
                backToProducts();
            }
        },
        [visibleTransactions, closePopup, updateTransaction, deleteTransaction]
    );

    const showBoughtProducts = useCallback(
        (transactionIndex: number, fallback: () => void) => {
            const transaction = transactionIndex >= 0 ? transactions.at(transactionIndex) : undefined;
            if (isUpdatingTransaction(transaction) || !transaction?.amount || !isStateReady) return;

            // PROCESSING transactions are editable only by their creator. Other
            // users can view the products but not modify or delete them.
            const isReadOnlyProcessing = isReadOnlyProcessingForUser(transaction);

            // A transaction with no product items is a provision: show a synthetic line so it is
            // still visible in the details (like a product would be).
            const isProvision = transaction.products.length === 0;
            const productLines = isProvision
                ? [PROVISION_KEYWORD + ' : ' + (transaction.customerName ?? '')]
                : transaction.products.map((product) => displayProduct(product, transaction.currency));

            // Add employer share line if the transaction has one
            if (transaction.employerShare && transaction.employerShare > 0) {
                productLines.push(
                    'Quote part employeur : -' +
                        toCurrency({ amount: transaction.employerShare, currency: transaction.currency })
                );
            }

            // Add fidelity points used line if the transaction has one
            if (transaction.fidelityPointsUsed && transaction.fidelityPointsUsed > 0) {
                productLines.push(
                    'Fidélité : -' +
                        toCurrency({ amount: transaction.fidelityPointsUsed, currency: transaction.currency })
                );
            }

            openPopup(
                toCurrency(transaction) +
                    ' en ' +
                    transaction.method +
                    (transaction.shortNumOrder ? ` [#${transaction.shortNumOrder}]` : ''),

                productLines.concat(isMobileSize() ? ['', BACK_KEYWORD] : []),
                (i, o) =>
                    o === BACK_KEYWORD
                        ? fallback()
                        : modifyTransaction(i !== -1 ? transactionIndex : i, (i) => showBoughtProducts(i, fallback)),
                true,
                isReadOnlyProcessing
                    ? undefined
                    : (productIndex) => {
                          // Provisions have no deletable product items; open the transaction menu instead.
                          if (isProvision) {
                              modifyTransaction(transactionIndex, () => showBoughtProducts(transactionIndex, fallback));
                              return;
                          }
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
        [
            transactions,
            openPopup,
            displayProduct,
            toCurrency,
            modifyTransaction,
            isStateReady,
            deleteBoughtProduct,
            isReadOnlyProcessingForUser,
        ]
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
        if (!visibleTransactions.length) return;

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
        visibleTransactions,
        displayTransaction,
        showBoughtProducts,
        displayTransactionsTitle,
        getTransactionIndex,
        sortedTransactions,
        getTransactionMenu,
    ]);

    const canDisplayTotal = useMemo(() => {
        setNeedRefresh(false);
        return Boolean(needRefresh || total || amount || selectedProduct || !visibleTransactions.length);
    }, [total, amount, selectedProduct, visibleTransactions, needRefresh]);

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
            } else if (visibleTransactions.length) {
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
            visibleTransactions,
            pay,
            showTransactionsSummary,
            showTransactionsSummaryMenu,
            isStateReady,
        ]
    );

    const clickClassName = twMerge(
        'active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark dark:active:text-popup-light',
        isStateReady && !isMobileDevice ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : ''
    );

    const { width: screenWidth, height: screenHeight } = useWindowParam();
    const left = useMemo(
        () => (compact ? 0 : !isMobileSize() && screenWidth > 0 ? screenWidth / 2 : 0),
        [compact, screenWidth]
    );
    const height = useMemo(
        () => (compact ? 0 : !isMobileSize() && screenHeight > 0 ? screenHeight - 76 : 0),
        [compact, screenHeight]
    );

    // Handler for order items selection change
    const handleOrderItemsChange = useCallback(
        (selectedItems: OrderItem[], totalAmount: number) => {
            setSelectedOrderItems(selectedItems);
            setPartialPaymentAmount(totalAmount);
        },
        [setSelectedOrderItems, setPartialPaymentAmount]
    );

    const popupClass = useAddPopupClass(
        compact
            ? 'relative w-1/2 h-full overflow-hidden border-l-4 border-active-light dark:border-active-dark flex flex-col '
            : 'inset-x-0 h-[52px] md:absolute md:left-1/2 md:h-full md:border-l-4 overflow-hidden ' +
                  'md:border-secondary-active-light md:dark:border-secondary-active-dark '
    );
    const isMobile = useIsMobile();

    // Payment icons mode: show payment methods as clickable icons in the top bar (desktop only).
    const paymentIconsEnabled = (parameters.display?.paymentIconsMode ?? true) && !isMobile;

    const availablePaymentMethods = useMemo(
        () =>
            paymentMethods
                .filter((m) => m.currency === currencies[currencyIndex].label && m.availability !== false)
                .map((m) => m.type),
        [paymentMethods, currencies, currencyIndex]
    );

    // A provision tops the customer balance up, so it must be settled with a real tender.
    // Débit spends the balance and Provision is the operation itself — both would produce a
    // nonsensical balance movement. Mirrors the sub-options filter in usePay.
    const provisionPaymentMethods = useMemo(
        () =>
            availablePaymentMethods.filter(
                (m) =>
                    m.toLowerCase() !== DEBIT_KEYWORD.toLowerCase() &&
                    m.toLowerCase() !== PROVISION_KEYWORD.toLowerCase()
            ),
        [availablePaymentMethods]
    );

    // Non-payment cashier actions shown as icons alongside payment methods.
    const availableActions = useMemo(() => {
        const actions: { type: string; label: string }[] = [];
        if (hasCashierPrinter()) actions.push({ type: PRINT_KEYWORD, label: 'Imprimer' });
        if (parameters.display?.showWaiting !== false)
            actions.push({ type: 'METTRE ' + WAITING_KEYWORD, label: 'Mettre en attente' });
        if (parameters.display?.showRefund !== false) actions.push({ type: REFUND_KEYWORD, label: 'Remboursement' });
        if ((parameters.fidelityRate ?? 0) > 0)
            actions.push({ type: USE_FIDELITY_KEYWORD, label: 'Utiliser fidélité' });
        return actions;
    }, [hasCashierPrinter, parameters.display?.showWaiting, parameters.display?.showRefund, parameters.fidelityRate]);

    const companyProductIndex = findCompanyProductIndex(products.current, categories, currentCustomer?.company);

    if (state === State.init || state === State.loading || state === State.error) {
        return (
            <div className={popupClass} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loading fullscreen={false} />
            </div>
        );
    }

    // If showPartialPaymentSelector is true, show the OrderItemsSelector instead of normal view
    if (showPartialPaymentSelector && orderId) {
        return (
            <div className={popupClass}>
                <div
                    className={twMerge(
                        'md:w-1/2 w-full fixed py-3 px-3 border-b-4 border-active-light dark:border-active-dark bg-blue-100 dark:bg-blue-900',
                        compact ? 'left-0' : 'left-0 md:left-1/2'
                    )}
                >
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                setShowPartialPaymentSelector(false);
                                setSelectedOrderItems([]);
                                setPartialPaymentAmount(0);
                            }}
                            className="shrink-0 text-xs md:text-sm px-2 md:px-3 py-1 md:py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                            {BACK_KEYWORD}
                        </button>
                        <span className="text-base md:text-lg font-bold truncate">Paiement Partiel</span>
                    </div>
                </div>
                <div
                    className="md:w-1/2 fixed top-16.25 md:top-18.25 left-0 w-full overflow-hidden"
                    style={{ left: left, height: height - 19 }}
                >
                    <OrderItemsSelector orderId={orderId} onSelectionChange={handleOrderItemsChange} />
                </div>
            </div>
        );
    }

    if (!transactionsLoaded && isStateReady && !compact) {
        return (
            <div className={popupClass} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="text-lg font-semibold animate-pulse">Chargement...</span>
            </div>
        );
    }

    const showTopBar =
        (canDisplayTotal && (total || canAddProvision)) || (!canDisplayTotal && visibleTransactions.length);

    if (!showTopBar && !compact) {
        return <div className={popupClass} />;
    }

    return (
        <div className={popupClass}>
            {showTopBar && (
                <div
                    className={twMerge(
                        compact ? 'w-full' : 'md:w-1/2 w-full',
                        compact ? 'relative' : 'fixed',
                        compact
                            ? 'top-0 left-0 text-center font-bold'
                            : 'top-0 left-0 md:left-1/2 text-center font-bold',
                        'border-b-4 border-active-light dark:border-active-dark z-10',
                        compact
                            ? 'block text-4xl h-14 shrink-0'
                            : isMobile
                              ? 'md:hidden text-4xl h-14'
                              : 'hidden md:block text-5xl h-20'
                    )}
                >
                    <div className="flex items-center h-full gap-0 w-full pl-0">
                        <TopNavWithRoleCheck
                            showLightAdminNav={showLightAdminNav}
                            isMobile={isMobile}
                            onCollapsedChange={(c) => setNavExpanded(!c)}
                        />
                        <div
                            className={twMerge(
                                'flex-1 h-full overflow-hidden whitespace-nowrap',
                                paymentIconsEnabled && !navExpanded
                                    ? 'flex items-center justify-between pl-0'
                                    : 'text-center'
                            )}
                            style={{ paddingRight: isMobile ? undefined : '3.5rem' }}
                        >
                            {canDisplayTotal ? (
                                canAddProvision && paymentIconsEnabled && !navExpanded ? (
                                    <>
                                        <span
                                            className={twMerge(
                                                `shrink-0 h-full inline-flex items-center px-2 ${compact ? 'text-5xl' : isMobile ? 'text-4xl' : 'text-6xl'}`,
                                                clickClassName
                                            )}
                                            title={toCurrency(amount)}
                                            onClick={handleClick}
                                            onContextMenu={handleClick}
                                        >
                                            <Amount value={amount} showZero />
                                        </span>
                                        <div
                                            className="flex items-center h-full gap-1 overflow-x-auto"
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onMouseUp={(e) => e.stopPropagation()}
                                        >
                                            {provisionPaymentMethods.map((method) => (
                                                <PaymentIconButton
                                                    key={method}
                                                    icon={getPaymentIcon(method)}
                                                    label={method}
                                                    onClick={() => payProvisionWithMethod(method)}
                                                    size={compact ? 40 : 52}
                                                />
                                            ))}
                                        </div>
                                    </>
                                ) : total ? (
                                    paymentIconsEnabled && !navExpanded ? (
                                        <>
                                            <span
                                                className={twMerge(
                                                    `shrink-0 h-full inline-flex items-center px-2 ${compact ? 'text-5xl' : isMobile ? 'text-4xl' : 'text-6xl'}`,
                                                    clickClassName
                                                )}
                                                title={toCurrency(total)}
                                                onClick={handleClick}
                                                onContextMenu={handleClick}
                                            >
                                                <Amount value={total} showZero />
                                            </span>
                                            <div
                                                className="flex items-center h-full gap-1 overflow-x-auto"
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onMouseUp={(e) => e.stopPropagation()}
                                            >
                                                {availablePaymentMethods.map((method) => (
                                                    <PaymentIconButton
                                                        key={method}
                                                        icon={getPaymentIcon(method)}
                                                        label={method}
                                                        onClick={() => payWithMethod(method)}
                                                        size={compact ? 40 : 52}
                                                    />
                                                ))}
                                                {parameters.display?.showDebit !== false && (
                                                    <PaymentIconButton
                                                        key={DEBIT_KEYWORD}
                                                        icon={getPaymentIcon(DEBIT_KEYWORD)}
                                                        label="Débit"
                                                        onClick={() => payWithMethod(DEBIT_KEYWORD)}
                                                        size={compact ? 40 : 52}
                                                    />
                                                )}
                                                {availableActions.length > 0 && (
                                                    <div className="w-px h-10 bg-current opacity-20 mx-1 shrink-0" />
                                                )}
                                                {availableActions.map((action) => (
                                                    <PaymentIconButton
                                                        key={action.type}
                                                        icon={getPaymentIcon(action.type)}
                                                        label={action.label}
                                                        onClick={() =>
                                                            action.type === USE_FIDELITY_KEYWORD
                                                                ? applyFidelity()
                                                                : payWithMethod(action.type)
                                                        }
                                                        size={compact ? 40 : 52}
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <span
                                            className={twMerge(
                                                `inline-flex items-center h-full w-full justify-center pl-0 pr-0 ${isMobile ? 'gap-1' : 'gap-2'} ${compact ? 'text-4xl' : isMobile ? 'text-4xl' : 'text-6xl'}`,
                                                clickClassName
                                            )}
                                            onClick={handleClick}
                                            onContextMenu={handleClick}
                                        >
                                            {!navExpanded && (
                                                <>
                                                    <IconWallet className="inline-block" size={isMobile ? 28 : 36} />
                                                    {label}
                                                    {' : '}
                                                </>
                                            )}
                                            <Amount value={total} showZero />
                                        </span>
                                    )
                                ) : (
                                    <span>&nbsp;</span>
                                )
                            ) : (
                                <span
                                    className={twMerge(
                                        `inline-flex items-center h-full w-full justify-center pl-0 pr-0 ${isMobile ? 'gap-1' : 'gap-2'}`,
                                        clickClassName
                                    )}
                                    onClick={handleClick}
                                    onContextMenu={handleClick}
                                >
                                    {!navExpanded && <IconReceipt className="inline-block" size={isMobile ? 28 : 36} />}
                                    {!navExpanded && 'Ticket : '}
                                    {visibleTransactions.length}
                                    <span className="text-xl mt-auto pb-1.5">{`vente${(visibleTransactions.length ?? 0) > 1 ? 's' : ''}`}</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div
                className={twMerge(
                    compact
                        ? 'w-full flex-1 relative flex flex-col text-center text-2xl font-bold min-h-0'
                        : 'md:w-1/2 fixed top-19 left-0 w-1/2 text-center text-2xl font-bold hidden md:flex md:flex-col'
                )}
                style={{ left: compact ? 0 : left, height: compact ? 'auto' : height }}
            >
                <div className="flex-1 overflow-y-auto">
                    {canDisplayTotal
                        ? products.current
                              .map((product, index) => ({
                                  product:
                                      index === companyProductIndex && employerShare > 0
                                          ? displayProduct(product) +
                                            '\n- quote part employeur = ' +
                                            toCurrency(employerShare)
                                          : displayProduct(product),
                                  isSelectedProduct: product === selectedProduct,
                              }))
                              .map(({ product, isSelectedProduct }, index) => (
                                  <Item
                                      className={twMerge(
                                          'pt-1 pb-1 pl-2',
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
                                              'pt-1 pb-1 pl-2',
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
                {!canDisplayTotal && !compact && (
                    <div className="shrink-0 pt-1 border-t-4 border-secondary-active-light dark:border-secondary-active-dark bg-primary-light dark:bg-primary-dark">
                        {displayTransactionsTitle()}
                    </div>
                )}
            </div>
        </div>
    );
};
