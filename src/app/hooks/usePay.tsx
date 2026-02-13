import { useCallback, useEffect, useMemo } from 'react';
import { QRCode } from '../components/QRCode';
import { Shop } from '../contexts/ConfigProvider';
import { isWaitingTransaction } from '../contexts/dataProvider/transactionHelpers';
import { IS_LOCAL, PRINT_KEYWORD, REFUND_KEYWORD, SEPARATOR, WAITING_KEYWORD } from '../utils/constants';
import { InventoryItem, Transaction } from '../utils/interfaces';
import { printReceipt } from '../utils/posPrinter';
import { useConfig } from './useConfig';
import { Crypto, PaymentStatus, useCrypto } from './useCrypto';
import { useData } from './useData';
import { usePopup } from './usePopup';

export type ReceiptData = {
    shop: Shop;
    transaction: Transaction;
    thanksMessage?: string;
    userName: string;
    inventory?: InventoryItem[];
    orderNumber?: string;
    serviceType?: 'emporter' | 'sur_place';
};

export const usePay = () => {
    const { openPopup, closePopup } = usePopup();
    const {
        updateTransaction,
        getCurrentTotal,
        toCurrency,
        total,
        amount,
        selectedProduct,
        transactions,
        products,
        reverseTransaction,
        orderId,
        setOrderId,
        orderData,
        setOrderData,
        selectedOrderItems,
        setSelectedOrderItems,
        partialPaymentAmount,
        setPartialPaymentAmount,
        showPartialPaymentSelector,
        setShowPartialPaymentSelector,
    } = useData();
    const { init, generate, refPaymentStatus, error, retry, crypto } = useCrypto();
    const { paymentMethods, currencies, currencyIndex, parameters, getPrintersNames, getPrinterAddresses, inventory } =
        useConfig();

    const canPay = useMemo(() => {
        // Can pay if we have a normal transaction OR partial payment selected
        return Boolean((total && !amount && !selectedProduct) || (orderId && partialPaymentAmount > 0));
    }, [total, amount, selectedProduct, orderId, partialPaymentAmount]);

    const canAddProduct = useMemo(() => Boolean(amount && selectedProduct), [amount, selectedProduct]);

    const printTransactionReceipt = useCallback(
        async (printerName?: string, transaction?: Transaction) => {
            // Prepare receipt data
            let currentTransaction = transaction;

            if (!currentTransaction) {
                // Try to find existing waiting transaction
                currentTransaction = transactions
                    .sort((a, b) => b.modifiedDate - a.modifiedDate)
                    .find(isWaitingTransaction);
            }

            // If no transaction exists, create a temporary one from current products
            if (!currentTransaction && products.current.length > 0) {
                currentTransaction = {
                    validator: parameters.user.name,
                    method: WAITING_KEYWORD,
                    amount: getCurrentTotal(),
                    createdDate: new Date().getTime(),
                    modifiedDate: new Date().getTime(),
                    currency: currencies[currencyIndex].label,
                    products: products.current,
                };
            }

            if (!currentTransaction) return { error: 'Aucune transaction à imprimer' };

            const printerAddresses = getPrinterAddresses(printerName);
            if (!printerAddresses.length) return { error: 'Imprimante non trouvée' };

            // Print the receipt
            return await printReceipt(printerAddresses, {
                shop: parameters.shop,
                transaction: currentTransaction,
                thanksMessage: parameters.thanksMessage,
                userName: parameters.user.name,
                inventory: inventory,
                orderNumber: orderData?.short_num_order,
                serviceType: orderData?.service_type,
            });
        },
        [
            parameters,
            transactions,
            getPrinterAddresses,
            inventory,
            products,
            getCurrentTotal,
            currencies,
            currencyIndex,
            orderData,
        ]
    );

    const printTransaction = useCallback(
        (printerName?: string, transaction?: Transaction) => {
            openPopup('Imprimer', ['Impression en cours ...']);
            printTransactionReceipt(printerName, transaction).then((response) => {
                if (!response.success) openPopup('Erreur', [response.error || "Impossible d'imprimer"]);
                else closePopup();
            });
        },
        [closePopup, openPopup, printTransactionReceipt]
    );

    const openQRCode = useCallback(
        (onCancel: (onConfirm: () => void) => void, onConfirm: () => void) => {
            openPopup(
                'Paiement : ' + toCurrency(getCurrentTotal()),
                [<QRCode key="QRCode" />],
                (index) => {
                    if (refPaymentStatus.current === PaymentStatus.Pending) {
                        onCancel(onConfirm);
                    } else if (refPaymentStatus.current === PaymentStatus.Error) {
                        if (index >= 0) {
                            generate(crypto);
                        } else {
                            closePopup(init);
                        }
                    } else if (refPaymentStatus.current === PaymentStatus.Finalized) {
                        updateTransaction('Crypto');
                        closePopup(init);
                    } else {
                        retry();
                        if (index < 0) {
                            openQRCode(onCancel, onConfirm);
                        }
                    }
                },
                true
            );
        },
        [
            updateTransaction,
            closePopup,
            generate,
            retry,
            refPaymentStatus,
            toCurrency,
            getCurrentTotal,
            openPopup,
            init,
            crypto,
        ]
    );

    const cancelOrConfirmPaiement = useCallback(
        (onConfirm: () => void) => {
            if (getCurrentTotal() === 0) return;

            openPopup(
                'Paiement : ' + toCurrency(getCurrentTotal()),
                ['Attendre paiement', 'Changer mode paiement', 'Annuler paiement'].concat(
                    IS_LOCAL || currencies[currencyIndex].symbol === 'Ğ1' ? 'Valider paiement' : []
                ),
                (index) => {
                    switch (index) {
                        case 1:
                            onConfirm();
                            init();
                            break;
                        case 2:
                            closePopup(init);
                            break;
                        case 3:
                            updateTransaction('Crypto');
                            closePopup(init);
                            break;
                        default:
                            retry();
                            openQRCode(cancelOrConfirmPaiement, onConfirm);
                            break;
                    }
                },
                true
            );
        },
        [
            openPopup,
            toCurrency,
            getCurrentTotal,
            openQRCode,
            retry,
            closePopup,
            init,
            updateTransaction,
            currencies,
            currencyIndex,
        ]
    );

    const selectPayment = useCallback(
        (option: string, fallback: () => void) => {
            switch (option.split(SEPARATOR)[0]) {
                case Crypto.Solana:
                case Crypto.June:
                    generate(option as Crypto);
                    openQRCode(cancelOrConfirmPaiement, fallback);
                    break;
                case 'Virement':
                    openPopup(
                        'IBAN : ' + paymentMethods.find((item) => item.type === 'Virement')?.id,
                        ['Valider paiement', 'Annuler paiement'],
                        (index) => {
                            if (index === 0) updateTransaction(option);
                        }
                    );
                    break;
                case PRINT_KEYWORD:
                    updateTransaction(WAITING_KEYWORD);
                    printTransaction(option);
                    break;
                case REFUND_KEYWORD:
                    // Use reverseTransaction to properly reverse quantities using computeQuantity
                    const currentTransaction: Transaction = {
                        validator: parameters.user.name,
                        method: option,
                        amount: getCurrentTotal(),
                        createdDate: new Date().getTime(),
                        modifiedDate: 0,
                        currency: currencies[currencyIndex].label,
                        products: products.current,
                    };

                    const reversedTransaction = reverseTransaction(currentTransaction);
                    // Replace current products with reversed ones
                    products.current.length = 0;
                    reversedTransaction.products.forEach((product) => {
                        products.current.push(product);
                    });

                    updateTransaction(option);
                    closePopup();
                    break;
                case WAITING_KEYWORD:
                case 'METTRE ' + WAITING_KEYWORD:
                    // Sauvegarder la transaction avec le statut EN ATTENTE
                    updateTransaction(WAITING_KEYWORD);
                    closePopup();
                    break;
                default:
                    // Pour les modes de paiement normaux, enregistrer comme payé
                    updateTransaction(option);
                    closePopup();
                    break;
            }
        },
        [
            openQRCode,
            cancelOrConfirmPaiement,
            generate,
            updateTransaction,
            closePopup,
            paymentMethods,
            openPopup,
            printTransaction,
            products,
            currencies,
            currencyIndex,
            getCurrentTotal,
            parameters.user.name,
            reverseTransaction,
        ]
    );

    // Function to handle partial payment
    const selectPaymentForPartial = useCallback(
        async (paymentMethod: string) => {
            if (!orderId || selectedOrderItems.length === 0) return;

            openPopup('Paiement partiel', ['Traitement du paiement...']);

            try {
                const paidItems = selectedOrderItems.map((item) => ({
                    id: item.id,
                    type: item.type,
                }));

                const response = await fetch('/api/sql/savePartialPayment', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        orderId,
                        paidItems,
                        paymentMethod,
                    }),
                });

                const result = await response.json();

                if (result.success) {
                    // Reload order data to update paid status
                    try {
                        const orderResponse = await fetch(`/api/sql/getOrderItemsForPayment?orderId=${orderId}`);
                        if (orderResponse.ok) {
                            const updatedOrderData = await orderResponse.json();
                            setOrderData(updatedOrderData);
                        }
                    } catch (err) {
                        console.error('Failed to reload order data:', err);
                    }

                    // Reset selection after successful payment
                    setSelectedOrderItems([]);
                    setPartialPaymentAmount(0);
                    setShowPartialPaymentSelector(false);

                    closePopup();

                    // Show success message
                    openPopup('Paiement réussi', [result.message, 'Fermer la caisse'], (index) => {
                        if (index < 0) {
                            // User clicked close button - just close popup without closing caisse
                            return;
                        }

                        // Reset partial payment state
                        setOrderId('');
                        setOrderData(null);
                        setSelectedOrderItems([]);
                        setPartialPaymentAmount(0);
                        closePopup();

                        // Send message to parent to close the iframe
                        if (window.parent && process.env.NEXT_PUBLIC_WEB_URL) {
                            window.parent.postMessage({ type: 'CLOSE_CAISSE' }, process.env.NEXT_PUBLIC_WEB_URL);
                        }
                    });
                } else {
                    openPopup('Erreur', ['Échec du paiement : ' + (result.error || 'Erreur inconnue')]);
                }
            } catch (error) {
                console.error('Error processing partial payment:', error);
                openPopup('Erreur', ['Erreur lors du traitement du paiement']);
            }
        },
        [
            orderId,
            selectedOrderItems,
            openPopup,
            closePopup,
            setOrderId,
            setOrderData,
            setSelectedOrderItems,
            setPartialPaymentAmount,
            setShowPartialPaymentSelector,
        ]
    );

    const pay = useCallback(() => {
        // Check if we're in partial payment mode (orderId is set AND selector is shown)
        if (orderId && selectedOrderItems.length > 0 && showPartialPaymentSelector) {
            // Partial payment mode - show payment methods for the selected items
            const total = partialPaymentAmount;
            if (total && paymentMethods.length) {
                const paymentMethodsLabels = paymentMethods
                    .filter((item) => item.currency === currencies[currencyIndex].symbol)
                    .map((item) => item.type);

                if (paymentMethodsLabels.length === 1) {
                    selectPaymentForPartial(paymentMethodsLabels[0]);
                } else {
                    openPopup(
                        'Paiement partiel : ' + toCurrency(total),
                        paymentMethodsLabels,
                        (index, option) => {
                            if (index < 0) {
                                // User clicked close button - go back to item selector
                                setShowPartialPaymentSelector(true);
                                return;
                            }
                            selectPaymentForPartial(option);
                        },
                        true
                    );
                }
            }
        } else {
            // Normal payment mode
            const total = getCurrentTotal();
            if (total && paymentMethods.length) {
                // Check if this order has already been partially paid
                if (orderId && orderData && orderData.paid_amount > 0) {
                    // Force partial payment mode - don't allow full payment on partially paid orders
                    setShowPartialPaymentSelector(true);
                    return;
                }

                const paymentMethodsLabels = paymentMethods
                    .filter((item) => item.currency === currencies[currencyIndex].symbol)
                    .map((item) => item.type);

                // Add printer options for printing before payment
                const printerOptions = getPrintersNames();

                // Add separator and additional options
                const allOptions = paymentMethodsLabels.concat(printerOptions).concat(['']);

                // Add PARTIAL PAYMENT option only if orderId is set AND order has at least 2 items
                if (orderId && orderData && orderData.items.length >= 2) {
                    allOptions.push('PAIEMENT PARTIEL');
                }

                allOptions.push('METTRE ' + WAITING_KEYWORD, REFUND_KEYWORD);

                if (paymentMethodsLabels.length === 1) {
                    selectPayment(paymentMethodsLabels[0], pay);
                } else {
                    openPopup(
                        'Paiement : ' + toCurrency(total),
                        allOptions,
                        (index, option) => {
                            if (index < 0) return;

                            // Handle PAIEMENT PARTIEL option
                            if (option === 'PAIEMENT PARTIEL') {
                                setShowPartialPaymentSelector(true);
                                closePopup();
                                return;
                            }

                            // Handle printer options
                            const printerOptions = getPrintersNames();
                            if (printerOptions.includes(option)) {
                                // Print the receipt
                                printTransaction(option);
                                // Put transaction in waiting status and close popup
                                updateTransaction(WAITING_KEYWORD);
                                closePopup();
                                return;
                            }

                            selectPayment(option, pay);
                        },
                        true
                    );
                }
            }
        }
    }, [
        selectPayment,
        selectPaymentForPartial,
        openPopup,
        closePopup,
        getCurrentTotal,
        paymentMethods,
        getPrintersNames,
        printTransaction,
        updateTransaction,
        toCurrency,
        currencies,
        currencyIndex,
        orderId,
        orderData,
        selectedOrderItems,
        showPartialPaymentSelector,
        setShowPartialPaymentSelector,
        partialPaymentAmount,
    ]);

    useEffect(() => {
        if (error?.message === 'Transaction timed out') {
            cancelOrConfirmPaiement(pay);
        }
    }, [error, cancelOrConfirmPaiement, pay]);

    return { pay, canPay, canAddProduct, printTransaction };
};
