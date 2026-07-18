import { useCallback, useEffect, useMemo, useRef } from 'react';
import { QRCode } from '../components/QRCode';
import CustomerSearchPopup from '../components/CustomerSearchPopup';
import { Shop } from '../contexts/ConfigProvider';
import { isWaitingTransaction } from '../contexts/dataProvider/transactionHelpers';
import {
    ARROW,
    BACK_KEYWORD,
    CATEGORY_SEPARATOR,
    DEBIT_KEYWORD,
    IS_LOCAL,
    PRINT_KEYWORD,
    PROVISION_KEYWORD,
    REFUND_KEYWORD,
    SEPARATOR,
    WAITING_KEYWORD,
} from '../utils/constants';
import { Currency, Customer, InventoryItem, SERVICE_TYPE_LABELS, ServiceType, Transaction } from '../utils/interfaces';
import { CLOSE, postMessageToParent, REFRESH } from '../utils/message';
import { printBalanceStatement, printReceipt } from '../utils/posPrinter';
import { useConfig } from './useConfig';
import { Crypto, PaymentStatus, useCrypto } from './useCrypto';
import { useData } from './useData';
import { usePopup } from './usePopup';

export type ReceiptData = {
    shop: Shop;
    transaction: Transaction;
    currency: Currency;
    thanksMessage?: string;
    userName: string;
    inventory?: InventoryItem[];
    orderNumber?: string;
    serviceType?: ServiceType;
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
        setCounterServiceType,
        currentCustomer,
        setCurrentCustomer,
    } = useData();
    const { init, generate, refPaymentStatus, error, retry, crypto } = useCrypto();
    const {
        paymentMethods,
        currencies,
        currencyIndex,
        parameters,
        getPrintersNames,
        getPrinterAddresses,
        inventory,
        modeFonctionnement,
        customers,
    } = useConfig();

    // Ref local pour éviter de redemander le type de service lors de l'appel récursif à pay()
    const serviceTypeSelectedRef = useRef(false);
    // Empêche la validation multiple d'un même popup de paiement (double-clic/tap)
    const paymentSelectionLockedRef = useRef(false);

    const canPay = useMemo(() => {
        // Can pay if we have a normal transaction OR partial payment selected
        return Boolean((total && !amount && !selectedProduct) || (orderId && partialPaymentAmount > 0));
    }, [total, amount, selectedProduct, orderId, partialPaymentAmount]);

    const canAddProduct = useMemo(() => Boolean(amount && selectedProduct), [amount, selectedProduct]);

    const canAddProvision = useMemo(
        () => Boolean(parameters.display?.showProvision && amount > 0 && !selectedProduct && !canPay && !canAddProduct),
        [parameters.display?.showProvision, amount, selectedProduct, canPay, canAddProduct]
    );

    const printTransactionReceipt = useCallback(
        async (printerName?: string, transaction?: Transaction) => {
            // Prepare receipt data
            let currentTransaction = transaction;
            const currency = currencies[currencyIndex];

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
                    currency: currency.label,
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
                currency,
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

    const handlePrintBalance = useCallback(
        async (customer: Customer) => {
            if (!customer.id) return;
            try {
                const response = await fetch(`/api/sql/getCustomerBalance?customerId=${customer.id}`);
                if (!response.ok) throw new Error('Failed to fetch balance');
                const { balance, history } = (await response.json()) as {
                    balance: number;
                    history: Array<{
                        amount: number;
                        operation: 'credit' | 'debit';
                        previous_balance: number;
                        new_balance: number;
                        created_at: string;
                    }>;
                };
                const printerAddresses = getPrinterAddresses();
                if (!printerAddresses.length) {
                    openPopup('Erreur', ['Aucune imprimante configurée']);
                    return;
                }
                const result = await printBalanceStatement(printerAddresses, {
                    customer: {
                        firstName: customer.firstName,
                        lastName: customer.lastName,
                        reference: customer.reference,
                    },
                    balance,
                    history: history.map((entry) => ({
                        amount: entry.amount,
                        operation: entry.operation,
                        previousBalance: entry.previous_balance,
                        newBalance: entry.new_balance,
                        createdAt: entry.created_at,
                    })),
                    shop: parameters.shop,
                    currency: currencies[currencyIndex],
                });
                if (!result.success) openPopup('Erreur', [result.error || "Impossible d'imprimer le relevé"]);
            } catch (error) {
                console.error('Failed to print balance:', error);
                openPopup('Erreur', ["Erreur lors de l'impression du relevé de solde"]);
            }
        },
        [getPrinterAddresses, parameters.shop, currencies, currencyIndex, openPopup]
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
            const updateCustomerBalance = async (customerId: number, amount: number, operation: 'credit' | 'debit') => {
                try {
                    const response = await fetch('/api/sql/updateCustomerBalance', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ customerId, amount, operation }),
                    });
                    if (!response.ok) {
                        const result = (await response.json().catch(() => ({}))) as { error?: string };
                        throw new Error(result.error || `HTTP ${response.status}`);
                    }
                } catch (error) {
                    console.error(`Failed to ${operation} customer balance:`, error);
                    // Surface the failure so staff know the balance is out of sync and can fix it manually.
                    openPopup('Erreur', [
                        "Le solde du client n'a pas pu être mis à jour.",
                        'Veuillez le corriger manuellement.',
                    ]);
                }
            };

            const finalizeProvisionPayment = async (customer: Customer, selectedOption: string) => {
                const provisionAmount = getCurrentTotal() || amount;
                const transaction: Transaction = {
                    validator: parameters.user.name,
                    method: selectedOption,
                    amount: provisionAmount,
                    createdDate: new Date().getTime(),
                    modifiedDate: new Date().getTime(),
                    currency: currencies[currencyIndex].label,
                    products: [],
                };
                updateTransaction(transaction);
                closePopup();
                if (customer.id) {
                    await updateCustomerBalance(customer.id, provisionAmount, 'credit');
                }
            };

            const finalizeDebitPayment = async (customer: Customer) => {
                // Capture the amount before updateTransaction, which may reset the current total.
                const amount = getCurrentTotal();
                updateTransaction(DEBIT_KEYWORD);
                closePopup();
                if (customer.id) {
                    await updateCustomerBalance(customer.id, amount, 'debit');
                }
            };

            const openCustomerSearchPopup = (onCustomerSelected: (customer: Customer) => void) => {
                openPopup(
                    'Sélectionner un client',
                    [
                        <CustomerSearchPopup
                            key="customerSearch"
                            customers={customers}
                            initialQuery=""
                            onPrintBalance={handlePrintBalance}
                            onSelectCustomer={(customer) => {
                                setCurrentCustomer(customer);
                                onCustomerSelected(customer);
                            }}
                            onCreateCustomer={async (customerName) => {
                                const newCustomer: Customer = {
                                    firstName: customerName.split(' ')[0] || customerName,
                                    lastName: customerName.split(' ').slice(1).join(' ') || '',
                                };
                                try {
                                    const response = await fetch('/api/sql/addCustomer', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(newCustomer),
                                    });
                                    const result = await response.json();
                                    if (result.success) {
                                        setCurrentCustomer(result.customer);
                                        onCustomerSelected(result.customer);
                                    } else {
                                        openPopup('Erreur', [
                                            'Échec de la création du client: ' + (result.error || 'Erreur inconnue'),
                                        ]);
                                    }
                                } catch (error) {
                                    console.error('Error creating customer:', error);
                                    openPopup('Erreur', ['Erreur lors de la création du client']);
                                }
                            }}
                            onSelectNoCustomer={() => closePopup()}
                        />,
                    ],
                    () => closePopup()
                );
            };

            const showProvisionSubOptions = (customer: Customer) => {
                const subOptions = paymentMethods
                    .filter(
                        (m) =>
                            m.currency === currencies[currencyIndex].label &&
                            m.type.toLowerCase() !== DEBIT_KEYWORD.toLowerCase() &&
                            m.type.toLowerCase() !== PROVISION_KEYWORD.toLowerCase()
                    )
                    .map((m) => m.type);
                subOptions.push(BACK_KEYWORD);
                if (subOptions.length === 1) {
                    openPopup('Erreur', ['Aucune méthode de paiement disponible']);
                    return;
                }
                openPopup('Mode de paiement PROVISION', subOptions, (index, selectedOption) => {
                    if (index < 0) return;
                    if (selectedOption === BACK_KEYWORD) {
                        closePopup(() => fallback());
                        return;
                    }
                    finalizeProvisionPayment(customer, selectedOption);
                });
            };

            const paymentType = option.split(SEPARATOR)[0].split(ARROW)[0].split(CATEGORY_SEPARATOR)[0].trim();

            switch (paymentType) {
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
                case PROVISION_KEYWORD: {
                    const subOption = option.includes(CATEGORY_SEPARATOR)
                        ? option.split(CATEGORY_SEPARATOR).slice(1).join(CATEGORY_SEPARATOR).trim()
                        : undefined;

                    if (subOption) {
                        if (!currentCustomer) {
                            openCustomerSearchPopup((customer) => finalizeProvisionPayment(customer, option));
                            return;
                        }
                        finalizeProvisionPayment(currentCustomer, option);
                        return;
                    }

                    if (!currentCustomer) {
                        openCustomerSearchPopup((customer) => showProvisionSubOptions(customer));
                        return;
                    }
                    showProvisionSubOptions(currentCustomer);
                    break;
                }
                case DEBIT_KEYWORD:
                    if (!currentCustomer) {
                        openCustomerSearchPopup((customer) => finalizeDebitPayment(customer));
                        return;
                    }
                    finalizeDebitPayment(currentCustomer);
                    break;
                case PRINT_KEYWORD:
                    updateTransaction(WAITING_KEYWORD);
                    printTransaction(option);
                    break;
                case REFUND_KEYWORD:
                    openPopup('⚠️​ Confirmer le remboursement ?', ['Continuer', 'Annuler'], (index, option) => {
                        if (option === 'Continuer') {
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
                        }
                    });
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
            currentCustomer,
            setCurrentCustomer,
            customers,
            handlePrintBalance,
            amount,
        ]
    );

    const addProvision = useCallback(() => {
        selectPayment(PROVISION_KEYWORD, () => {});
    }, [selectPayment]);

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

                    // Notify parent window (kitchen view) to refresh orders
                    // Use REFRESH_ORDERS instead of PAYMENT_COMPLETE to avoid closing the cashier
                    postMessageToParent(REFRESH);

                    // Reset selection after successful payment
                    setSelectedOrderItems([]);
                    setPartialPaymentAmount(0);
                    setShowPartialPaymentSelector(false);

                    closePopup();

                    // Show success message
                    openPopup('Paiement réussi', [result.message, 'Fermer la caisse'], (index, option) => {
                        // Reset selection state always
                        setSelectedOrderItems([]);
                        setPartialPaymentAmount(0);
                        setShowPartialPaymentSelector(false);

                        // Only reset orderId/orderData and close iframe when "Fermer la caisse" is clicked
                        if (index >= 0 && option === 'Fermer la caisse') {
                            setOrderId('');
                            setOrderData(null);

                            postMessageToParent(CLOSE);
                        }
                        // If X is clicked (index < 0), keep orderId/orderData to prevent full payment
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
        // Nouveau cycle de paiement: on déverrouille la sélection
        paymentSelectionLockedRef.current = false;

        // Check if we're in partial payment mode (orderId is set AND selector is shown)
        if (orderId && selectedOrderItems.length > 0 && showPartialPaymentSelector) {
            // Partial payment mode - show payment methods for the selected items
            const total = partialPaymentAmount;
            if (total && paymentMethods.length) {
                const paymentMethodsLabels = paymentMethods
                    .filter((item) => item.currency === currencies[currencyIndex].label)
                    .map((item) => item.type);

                if (paymentMethodsLabels.length === 1) {
                    if (paymentSelectionLockedRef.current) return;
                    paymentSelectionLockedRef.current = true;
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
                            if (paymentSelectionLockedRef.current) return;
                            paymentSelectionLockedRef.current = true;
                            selectPaymentForPartial(option);
                        },
                        true
                    );
                }
            }
        } else {
            // Normal payment mode

            // En mode fastfood, demander le type de service avant le paiement comptoir.
            // En mode restaurant/lite, on force sur_place de facon transparente.
            if (!orderId && modeFonctionnement !== 'fastfood') {
                setCounterServiceType('sur_place');
            }

            if (modeFonctionnement === 'fastfood' && !orderId && !serviceTypeSelectedRef.current) {
                openPopup(
                    'Type de service',
                    Object.values(SERVICE_TYPE_LABELS),
                    (index) => {
                        if (index < 0) return; // annulé
                        const types = Object.keys(SERVICE_TYPE_LABELS) as ServiceType[];
                        setCounterServiceType(types[index]);
                        serviceTypeSelectedRef.current = true;
                        closePopup(() => pay());
                    },
                    true
                );
                return;
            }
            // Remettre à zéro pour la prochaine commande
            serviceTypeSelectedRef.current = false;

            const total = getCurrentTotal();
            if (total && paymentMethods.length) {
                // Check if this order has already been partially paid
                if (orderId && orderData && orderData.paid_amount > 0) {
                    // Force partial payment mode - don't allow full payment on partially paid orders
                    setShowPartialPaymentSelector(true);
                    return;
                }

                const paymentMethodsLabels = paymentMethods
                    .filter((item) => item.currency === currencies[currencyIndex].label)
                    .map((item) => item.type);

                // Add printer options for printing before payment
                const printerOptions = getPrintersNames();

                // Add separator and additional options
                const allOptions = paymentMethodsLabels.concat(printerOptions).concat(['']);

                // Add PARTIAL PAYMENT option only if orderId is set AND order has at least 2 items
                if (orderId && orderData && orderData.items.length >= 2) {
                    allOptions.push('PAIEMENT PARTIEL');
                }

                // Add waiting, refund, and debit options based on display settings (default to true if not set)
                if (parameters.display?.showWaiting !== false) allOptions.push('METTRE ' + WAITING_KEYWORD);

                if (parameters.display?.showRefund !== false) allOptions.push(REFUND_KEYWORD);

                if (parameters.display?.showDebit !== false) allOptions.push(DEBIT_KEYWORD);

                if (paymentMethodsLabels.length === 1) {
                    if (paymentSelectionLockedRef.current) return;
                    paymentSelectionLockedRef.current = true;
                    selectPayment(paymentMethodsLabels[0], pay);
                } else {
                    openPopup(
                        'Paiement : ' + toCurrency(total),
                        allOptions,
                        (index, option) => {
                            if (index < 0) return;
                            if (paymentSelectionLockedRef.current) return;
                            paymentSelectionLockedRef.current = true;

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
        parameters.display?.showWaiting,
        parameters.display?.showRefund,
        parameters.display?.showDebit,
        setShowPartialPaymentSelector,
        partialPaymentAmount,
        modeFonctionnement,
        setCounterServiceType,
    ]);

    useEffect(() => {
        if (error?.message === 'Transaction timed out') {
            cancelOrConfirmPaiement(pay);
        }
    }, [error, cancelOrConfirmPaiement, pay]);

    return { pay, canPay, canAddProduct, canAddProvision, addProvision, printTransaction };
};
