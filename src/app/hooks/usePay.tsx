import { useCallback, useEffect, useMemo, useRef } from 'react';
import { QRCode } from '../components/QRCode';
import CustomerSearchPopup from '../components/CustomerSearchPopup';
import { CashPaymentPopup } from '../components/CashPaymentPopup';
import { ChangeDisplayPopup } from '../components/ChangeDisplayPopup';
import { Shop } from '../contexts/ConfigProvider';
import { floorToSeconds } from '../contexts/DataProvider';
import { computeFidelityDelta } from '../utils/fidelity';
import { isWaitingTransaction } from '../contexts/dataProvider/transactionHelpers';
import {
    ARROW,
    CATEGORY_SEPARATOR,
    DEBIT_KEYWORD,
    DELETED_KEYWORD,
    FIDELITY_KEYWORD,
    IS_LOCAL,
    NON_PAYMENT_KEYWORDS,
    PRINT_KEYWORD,
    PRINT_NO_DETAIL,
    PRINT_WITH_DETAIL,
    PRINTER_ROLE,
    PROCESSING_KEYWORD,
    PROVISION_KEYWORD,
    REFUND_KEYWORD,
    SEPARATOR,
    UPDATING_KEYWORD,
    USE_FIDELITY_KEYWORD,
    WAITING_KEYWORD,
} from '../utils/constants';
import {
    Currency,
    Customer,
    EmptyDiscount,
    InventoryItem,
    Product,
    SERVICE_TYPE_LABELS,
    ServiceType,
    Transaction,
} from '../utils/interfaces';
import { CLOSE, postCustomerDisplay, postMessageToParent, REFRESH } from '../utils/message';
import { printBalanceStatement, printKitchenTicket, printReceipt } from '../utils/posPrinter';
import { buildCustomerDisplay, buildPaymentDisplay, holdChangeDisplay } from '../utils/customerDisplay';
import { getPublicKey, resolveCashierPrinter } from '../utils/processData';
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
    showDetails?: boolean;
    mealCount?: number;
};

export const usePay = () => {
    const { openPopup, closePopup, openFullscreenPopup } = usePopup();
    const {
        updateTransaction,
        getCustomerTotal,
        employerShare,
        toCurrency,
        total,
        amount,
        selectedProduct,
        transactions,
        products,
        addProduct,
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
        counterServiceType,
        currentCustomer,
        setCurrentCustomer,
        wasWaitingBeforeEditRef,
        originalProductsSnapshotRef,
    } = useData();
    const { init, generate, refPaymentStatus, error, retry, crypto } = useCrypto();
    const {
        paymentMethods,
        currencies,
        currencyIndex,
        parameters,
        getPrinterAddressByRole,
        hasCashierPrinter,
        inventory,
        setCustomers,
    } = useConfig();

    // Ref to hold autoPrint so commitTransaction can call it without ordering issues.
    const autoPrintRef = useRef<
        (method: string, transaction?: Transaction, isCancelingExisting?: boolean, skipKitchenPrint?: boolean) => void
    >(() => {});

    // Compute the delta between the original WAITING tx products and the current products,
    // then print a kitchen ticket showing only what changed (additions and removals).
    const printKitchenDelta = useCallback(
        (transaction: Transaction) => {
            const original = originalProductsSnapshotRef.current;
            if (!original.length) return;

            const currentProducts = transaction.products;
            const deltaProducts: { label: string; quantity: number; category: string; amount: number }[] = [];

            // Find products that were removed or had their quantity reduced
            original.forEach((orig) => {
                const curr = currentProducts.find(
                    (p) =>
                        p.label === orig.label &&
                        p.category === orig.category &&
                        p.amount === orig.amount &&
                        p.options === orig.options
                );
                const origQty = orig.quantity;
                const currQty = curr?.quantity ?? 0;
                const diff = currQty - origQty;
                if (diff < 0) {
                    deltaProducts.push({
                        label: orig.label,
                        quantity: diff,
                        category: orig.category,
                        amount: orig.amount,
                    });
                }
            });

            // Find products that were added or had their quantity increased
            currentProducts.forEach((curr) => {
                const orig = original.find(
                    (p) =>
                        p.label === curr.label &&
                        p.category === curr.category &&
                        p.amount === curr.amount &&
                        p.options === curr.options
                );
                const origQty = orig?.quantity ?? 0;
                const currQty = curr.quantity;
                const diff = currQty - origQty;
                if (diff > 0) {
                    deltaProducts.push({
                        label: curr.label,
                        quantity: diff,
                        category: curr.category,
                        amount: curr.amount,
                    });
                }
            });

            if (!deltaProducts.length) return;

            const kitchenAddr = getPrinterAddressByRole(PRINTER_ROLE.kitchen);
            if (!kitchenAddr) return;

            const deltaTransaction: Transaction = {
                ...transaction,
                products: deltaProducts as Product[],
            };

            printKitchenTicket([kitchenAddr], {
                transaction: deltaTransaction,
                serviceType:
                    orderData?.service_type ??
                    (transaction.takeOut === true ? 'takeout' : transaction.takeOut === false ? 'dine_in' : undefined),
            }).then((response) => {
                if (!response.success) console.error('[printKitchenDelta] Kitchen print failed:', response.error);
            });
        },
        [getPrinterAddressByRole, orderData, originalProductsSnapshotRef]
    );

    // Finalise une transaction validée et déselectionne le client en cours.
    const commitTransaction = useCallback(
        (item: string | Transaction, isCancelingExisting = false) => {
            const method = typeof item === 'string' ? item : item.method;
            let transaction: Transaction | undefined;
            if (typeof item === 'object') {
                transaction = item;
            } else {
                const now = floorToSeconds(new Date().getTime());
                // Extract fidelity points used from the cart (negative product line)
                const fidelityProduct = products.current.find((p) => p.category === FIDELITY_KEYWORD);
                const fidelityPointsUsed = fidelityProduct ? Math.abs(fidelityProduct.total ?? 0) : 0;
                transaction = {
                    validator: parameters.user.name,
                    method,
                    amount: getCustomerTotal(),
                    createdDate: now,
                    modifiedDate: now,
                    currency: currencies[currencyIndex].label,
                    products: [...products.current],
                    takeOut: counterServiceType === 'takeout',
                    ...(employerShare > 0 ? { employerShare } : {}),
                    ...(fidelityPointsUsed > 0 ? { fidelityPointsUsed } : {}),
                };
            }
            updateTransaction(item);

            // Optimistically mirror the server-side fidelity update so the balance shown on the
            // next screen is already correct. `computeFidelityDelta` is the shared source of
            // truth, so this can never drift from what saveTransaction persists.
            const customerName =
                transaction.customerName ||
                (currentCustomer ? `${currentCustomer.firstName} ${currentCustomer.lastName}`.trim() : '');
            if (customerName) {
                const fidelityDelta = computeFidelityDelta(
                    method,
                    transaction.amount,
                    transaction.fidelityPointsUsed ?? 0,
                    parameters.fidelityRate ?? 0,
                    Boolean(transaction.products?.length)
                );
                if (fidelityDelta !== 0) {
                    // Prefer matching on id (names are not unique); fall back to the full name,
                    // which is what the server matches on.
                    const customerId = currentCustomer?.id;
                    setCustomers((prev) =>
                        prev.map((c) => {
                            const isMatch =
                                customerId != null && c.id != null
                                    ? c.id === customerId
                                    : `${c.firstName} ${c.lastName}`.trim() === customerName;
                            if (!isMatch) return c;
                            // Server clamps at zero, so clamp here too.
                            return { ...c, fidelityPoints: Math.max(0, (c.fidelityPoints ?? 0) + fidelityDelta) };
                        })
                    );
                }
            }

            if (method !== WAITING_KEYWORD) {
                setCurrentCustomer(null);
            }
            // If the tx was WAITING before being edited, the kitchen already received a ticket.
            // Skip full kitchen print — instead print a delta ticket showing only what changed.
            const wasWaiting = wasWaitingBeforeEditRef.current;
            const isRefundMethod = method === REFUND_KEYWORD;
            autoPrintRef.current(method, transaction, isCancelingExisting, wasWaiting);
            if (wasWaiting && transaction && !isRefundMethod) {
                printKitchenDelta(transaction);
            }
            // Reset the flags after use
            wasWaitingBeforeEditRef.current = false;
            originalProductsSnapshotRef.current = [];
        },
        [
            updateTransaction,
            setCurrentCustomer,
            parameters.user.name,
            parameters.fidelityRate,
            getCustomerTotal,
            employerShare,
            currencies,
            currencyIndex,
            products,
            counterServiceType,
            currentCustomer,
            setCustomers,
            wasWaitingBeforeEditRef,
            originalProductsSnapshotRef,
            printKitchenDelta,
        ]
    );

    // Opens the cash drawer connected to the cashier printer's DK port (RJ11).
    // Priority: device's cashDrawerCom > device's printerCom > cashier printer from PrintersConfig.
    const triggerCashDrawer = useCallback(() => {
        const publicKey = getPublicKey();
        const fetchAndOpen = async () => {
            let address: string | undefined;
            let baudRate: number | undefined;

            // Try device hardware config first
            if (publicKey) {
                try {
                    const res = await fetch(`/api/sql/getDeviceHardware?publicKey=${encodeURIComponent(publicKey)}`);
                    if (res.ok) {
                        const hw = await res.json();
                        address = hw.cashDrawerCom || hw.printerCom || undefined;
                        // Use the baud rate that matches the port we're actually targeting.
                        if (hw.cashDrawerCom) {
                            baudRate = hw.cashDrawerBaud || undefined;
                        } else if (hw.printerCom) {
                            baudRate = hw.printerBaud || undefined;
                        }
                    }
                } catch {
                    // Fall back to printer config
                }
            }

            // Fall back to cashier printer from PrintersConfig
            if (!address) {
                address = getPrinterAddressByRole(PRINTER_ROLE.cashier);
            }

            if (!address) {
                console.warn('[CASH DRAWER] No cash drawer COM or cashier printer configured — drawer will not open');
                return;
            }
            console.log(`[CASH DRAWER] Triggering open on ${address}${baudRate ? ` @ ${baudRate} baud` : ''}`);
            fetch('/api/open-cash-drawer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ printerAddress: address, baudRate }),
            })
                .then(async (res) => {
                    if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        console.error('[CASH DRAWER] API error:', res.status, body?.error || res.statusText);
                    }
                })
                .catch((err) => console.error('[CASH DRAWER] Failed to open:', err));
        };
        fetchAndOpen();
    }, [getPrinterAddressByRole]);

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
        () =>
            Boolean(
                parameters.display?.showProvision !== false &&
                    amount > 0 &&
                    !selectedProduct &&
                    !total &&
                    !canPay &&
                    !canAddProduct
            ),
        [parameters.display?.showProvision, amount, selectedProduct, total, canPay, canAddProduct]
    );

    const printTransactionReceipt = useCallback(
        async (
            transaction?: Transaction,
            printerAddressOverride?: string,
            showDetails?: boolean,
            mealCount?: number
        ) => {
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
                    amount: getCustomerTotal(),
                    createdDate: new Date().getTime(),
                    modifiedDate: new Date().getTime(),
                    currency: currency.label,
                    products: products.current,
                    ...(employerShare > 0 ? { employerShare } : {}),
                };
            }

            if (!currentTransaction) return { error: 'Aucune transaction à imprimer' };

            let printerAddresses: string[];
            let comBaud: number | undefined;
            if (printerAddressOverride) {
                printerAddresses = [printerAddressOverride];
            } else {
                const resolved = await resolveCashierPrinter(getPrinterAddressByRole);
                if ('error' in resolved) return { error: resolved.error };
                printerAddresses = resolved.addresses;
                comBaud = resolved.baud;
            }
            if (!printerAddresses.length) return { error: 'Imprimante non trouvée' };

            // Print the receipt
            return await printReceipt(
                printerAddresses,
                {
                    shop: parameters.shop,
                    transaction: currentTransaction,
                    currency,
                    thanksMessage: parameters.thanksMessage,
                    userName: parameters.user.name,
                    inventory: inventory,
                    orderNumber: orderData?.short_num_order,
                    serviceType: orderData?.service_type,
                    showDetails: showDetails !== false,
                    mealCount,
                },
                comBaud
            );
        },
        [
            parameters,
            transactions,
            getPrinterAddressByRole,
            inventory,
            products,
            getCustomerTotal,
            employerShare,
            currencies,
            currencyIndex,
            orderData,
        ]
    );

    const printKitchenReceipt = useCallback(
        async (transaction?: Transaction, printerAddressOverride?: string) => {
            let currentTransaction = transaction;

            if (!currentTransaction) {
                currentTransaction = transactions
                    .sort((a, b) => b.modifiedDate - a.modifiedDate)
                    .find(isWaitingTransaction);
            }

            if (!currentTransaction && products.current.length > 0) {
                currentTransaction = {
                    validator: parameters.user.name,
                    method: WAITING_KEYWORD,
                    amount: getCustomerTotal(),
                    createdDate: new Date().getTime(),
                    modifiedDate: new Date().getTime(),
                    currency: currencies[currencyIndex].label,
                    products: products.current,
                    takeOut: counterServiceType === 'takeout',
                    ...(employerShare > 0 ? { employerShare } : {}),
                };
            }

            if (!currentTransaction) return { error: 'Aucune transaction à imprimer' };

            const kitchenAddr = printerAddressOverride || getPrinterAddressByRole(PRINTER_ROLE.kitchen);
            // No kitchen printer configured — silently succeed (not an error).
            // This prevents spurious error logs from all callers (autoPrint, Delete, etc.).
            if (!kitchenAddr) return { success: true };

            return await printKitchenTicket([kitchenAddr], {
                transaction: currentTransaction,
                serviceType:
                    orderData?.service_type ??
                    (currentTransaction.takeOut === true
                        ? 'takeout'
                        : currentTransaction.takeOut === false
                          ? 'dine_in'
                          : undefined),
            });
        },
        [
            transactions,
            parameters.user.name,
            currencies,
            currencyIndex,
            products,
            getCustomerTotal,
            employerShare,
            getPrinterAddressByRole,
            orderData,
            counterServiceType,
        ]
    );

    // Auto-print to kitchen when order is put in waiting/processing state or paid.
    // Auto-print to kitchen when an existing order is refunded or deleted (cancellation ticket).
    // Auto-print to cashier when order is fully paid or refunded.
    const autoPrint = useCallback(
        (method: string, transaction?: Transaction, isCancelingExisting = false, skipKitchenPrint = false) => {
            const isWaiting = method === WAITING_KEYWORD || method === PROCESSING_KEYWORD;
            const isRefund = method === REFUND_KEYWORD;
            const isDeleted = method === DELETED_KEYWORD;
            const isPaid = !isWaiting && !isRefund && !isDeleted && method !== UPDATING_KEYWORD;

            // Print kitchen ticket for new orders (waiting/paid) or when canceling an existing order
            // Skip if the kitchen already received a ticket (e.g. paying a previously WAITING tx)
            // Skip if no kitchen printer is configured — don't log an error, just silently skip.
            if (
                !skipKitchenPrint &&
                (isWaiting || isPaid || (isRefund && isCancelingExisting) || (isDeleted && isCancelingExisting))
            ) {
                const kitchenAddr = getPrinterAddressByRole(PRINTER_ROLE.kitchen);
                if (!kitchenAddr) return; // No kitchen printer configured — nothing to print

                printKitchenReceipt(transaction).then((response) => {
                    if (!response.success) console.error('[autoPrint] Kitchen print failed:', response.error);
                });
            }

            // Cashier receipt is printed on demand only (via the "Imprimer" button),
            // not automatically on payment.
        },
        [printKitchenReceipt, getPrinterAddressByRole]
    );
    autoPrintRef.current = autoPrint;

    const printTransaction = useCallback(
        (transaction?: Transaction, showDetails?: boolean, mealCount?: number) => {
            openPopup('Imprimer', ['Impression en cours ...']);
            printTransactionReceipt(transaction, undefined, showDetails, mealCount).then((response) => {
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
                const resolved = await resolveCashierPrinter(getPrinterAddressByRole);
                if ('error' in resolved) {
                    openPopup('Erreur', [resolved.error]);
                    return;
                }
                const { addresses: printerAddresses, baud: comBaud } = resolved;
                if (!printerAddresses.length) {
                    openPopup('Erreur', ['Aucune imprimante configurée']);
                    return;
                }
                const result = await printBalanceStatement(
                    printerAddresses,
                    {
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
                    },
                    comBaud
                );
                if (!result.success) openPopup('Erreur', [result.error || "Impossible d'imprimer le relevé"]);
            } catch (error) {
                console.error('Failed to print balance:', error);
                openPopup('Erreur', ["Erreur lors de l'impression du relevé de solde"]);
            }
        },
        [getPrinterAddressByRole, parameters.shop, currencies, currencyIndex, openPopup]
    );

    // Open the customer search popup. Extracted as a standalone callback so it can be
    // reused by both selectPayment and applyFidelity without duplicating the logic.
    const openCustomerSearchPopup = useCallback(
        (onCustomerSelected: (customer: Customer) => void, initialQuery: string = '') => {
            openFullscreenPopup(
                'Sélectionner un client',
                [
                    <CustomerSearchPopup
                        key="customerSearch"
                        initialQuery={initialQuery}
                        onPrintBalance={handlePrintBalance}
                        onSelectCustomer={(customer) => {
                            setCurrentCustomer(customer);
                            onCustomerSelected(customer);
                        }}
                        onCreateCustomer={async (customerName) => {
                            const trimmed = customerName.trim();
                            const spaceIndex = trimmed.indexOf(' ');
                            if (spaceIndex === -1) {
                                openFullscreenPopup(
                                    'Veuillez ajouter un nom de famille séparé par un espace',
                                    ['OK'],
                                    () => openCustomerSearchPopup(onCustomerSelected, trimmed),
                                    false
                                );
                                return;
                            }
                            const newCustomer: Customer = {
                                firstName: trimmed.slice(0, spaceIndex),
                                lastName: trimmed.slice(spaceIndex + 1),
                            };
                            try {
                                const response = await fetch('/api/sql/addCustomer', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(newCustomer),
                                });
                                const result = await response.json();
                                if (result.success) {
                                    setCustomers((prev) => [...prev, result.customer]);
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
                    />,
                ],
                () => {},
                true
            );
        },
        [openFullscreenPopup, handlePrintBalance, setCurrentCustomer, setCustomers, openPopup]
    );

    const openQRCode = useCallback(
        (onCancel: (onConfirm: () => void) => void, onConfirm: () => void) => {
            openPopup(
                'Paiement : ' + toCurrency(getCustomerTotal()),
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
                        commitTransaction('Crypto');
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
            commitTransaction,
            closePopup,
            generate,
            retry,
            refPaymentStatus,
            toCurrency,
            getCustomerTotal,
            openPopup,
            init,
            crypto,
        ]
    );

    const cancelOrConfirmPaiement = useCallback(
        (onConfirm: () => void) => {
            if (getCustomerTotal() === 0) return;

            openPopup(
                'Paiement : ' + toCurrency(getCustomerTotal()),
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
                            commitTransaction('Crypto');
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
            getCustomerTotal,
            openQRCode,
            retry,
            closePopup,
            init,
            commitTransaction,
            currencies,
            currencyIndex,
        ]
    );

    const finalizeProvisionPayment = useCallback(
        async (customer: Customer, selectedOption: string) => {
            const provisionAmount = getCustomerTotal() || amount;
            const now = floorToSeconds(new Date().getTime());
            const fullName = `${customer.firstName} ${customer.lastName}`.trim();
            const transaction: Transaction = {
                validator: parameters.user.name,
                method: selectedOption,
                amount: provisionAmount,
                createdDate: now,
                modifiedDate: now,
                currency: currencies[currencyIndex].label,
                products: [],
                customerName: fullName,
            };
            // Optimistically update the customer's balance so the NumPad shows
            // the new value immediately, without waiting for the API refetch.
            const updatedCustomer = {
                ...customer,
                balance: (customer.balance ?? 0) + provisionAmount,
            };
            setCurrentCustomer(updatedCustomer);
            setCustomers((prev) =>
                prev.map((c) => (c.id === customer.id ? { ...c, balance: (c.balance ?? 0) + provisionAmount } : c))
            );
            commitTransaction(transaction);
            closePopup();
        },
        [
            getCustomerTotal,
            amount,
            parameters.user.name,
            currencies,
            currencyIndex,
            setCurrentCustomer,
            setCustomers,
            commitTransaction,
            closePopup,
        ]
    );

    const finalizeDebitPayment = useCallback(
        async (customer: Customer) => {
            const debitAmount = getCustomerTotal();
            const now = floorToSeconds(new Date().getTime());
            const fullName = `${customer.firstName} ${customer.lastName}`.trim();
            const transaction: Transaction = {
                validator: parameters.user.name,
                method: DEBIT_KEYWORD,
                amount: debitAmount,
                createdDate: now,
                modifiedDate: now,
                currency: currencies[currencyIndex].label,
                products: products.current,
                customerName: fullName,
                ...(employerShare > 0 ? { employerShare } : {}),
            };
            setCurrentCustomer(customer);
            commitTransaction(transaction);
            closePopup();
        },
        [
            getCustomerTotal,
            parameters.user.name,
            currencies,
            currencyIndex,
            products,
            employerShare,
            setCurrentCustomer,
            commitTransaction,
            closePopup,
        ]
    );

    const showProvisionSubOptions = useCallback(
        (customer: Customer) => {
            const subOptions = paymentMethods
                .filter(
                    (m) =>
                        m.currency === currencies[currencyIndex].label &&
                        m.availability !== false &&
                        m.type.toLowerCase() !== DEBIT_KEYWORD.toLowerCase() &&
                        m.type.toLowerCase() !== PROVISION_KEYWORD.toLowerCase()
                )
                .map((m) => m.type);
            if (subOptions.length === 0) {
                openPopup('Erreur', ['Aucune méthode de paiement disponible']);
                return;
            }
            openPopup('Mode de paiement PROVISION', subOptions, (index, selectedOption) => {
                if (index < 0) return;
                finalizeProvisionPayment(customer, selectedOption);
            });
        },
        [paymentMethods, currencies, currencyIndex, openPopup, finalizeProvisionPayment]
    );

    // Pay a provision (customer balance top-up) directly with a specific payment method.
    // Bypasses the sub-options popup — used by the desktop payment-icons bar when an amount
    // is entered without a product. If no customer is selected, prompts for one first.
    const payProvisionWithMethod = useCallback(
        (method: string) => {
            if (!currentCustomer) {
                openCustomerSearchPopup((customer) => finalizeProvisionPayment(customer, method));
                return;
            }
            finalizeProvisionPayment(currentCustomer, method);
        },
        [currentCustomer, openCustomerSearchPopup, finalizeProvisionPayment]
    );

    const selectPayment = useCallback(
        (option: string, fallback: () => void) => {
            const paymentType = option.split(SEPARATOR)[0].split(ARROW)[0].split(CATEGORY_SEPARATOR)[0].trim();

            // On demande le type de service uniquement si l'option useTakeOut est activée,
            // quel que soit le mode (fastfood, restaurant, lite).
            // Skip pour les actions non-paiement (remboursement, impression, mise en attente...).
            const useTakeOut = parameters.display?.useTakeOut !== false;
            const needsServiceType =
                !orderId &&
                !NON_PAYMENT_KEYWORDS.includes(paymentType) &&
                paymentType !== PROVISION_KEYWORD &&
                useTakeOut;

            if (needsServiceType && !serviceTypeSelectedRef.current) {
                openPopup(
                    'Type de service',
                    Object.values(SERVICE_TYPE_LABELS),
                    (index) => {
                        if (index < 0) return; // annulé
                        const types = Object.keys(SERVICE_TYPE_LABELS) as ServiceType[];
                        setCounterServiceType(types[index]);
                        serviceTypeSelectedRef.current = true;
                        closePopup(() => selectPayment(option, fallback));
                    },
                    true
                );
                return;
            }

            // Notify the customer-facing display about the payment type. Internal actions
            // (printing, putting on hold, refunding...) are not payments and must not be shown.
            if (!NON_PAYMENT_KEYWORDS.includes(paymentType)) {
                postCustomerDisplay(buildPaymentDisplay(paymentType, getCustomerTotal(), currencies[currencyIndex]));
            }

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
                            if (index === 0) commitTransaction(option);
                        }
                    );
                    break;
                case PROVISION_KEYWORD: {
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
                    {
                        const kitchenAddr = getPrinterAddressByRole(PRINTER_ROLE.kitchen);
                        if (kitchenAddr) {
                            printKitchenReceipt(undefined, kitchenAddr);
                        }
                    }
                    break;
                case REFUND_KEYWORD:
                    openPopup('⚠️​ Confirmer le remboursement ?', ['Continuer', 'Annuler'], (_, option) => {
                        if (option === 'Continuer') {
                            const originalTransaction = transactions.find(
                                (t) => t.method === PROCESSING_KEYWORD || t.method === UPDATING_KEYWORD
                            );
                            // Refund from scratch: no kitchen ticket (isCancelingExisting = false).
                            // Refund of existing tx is handled directly by refundTransaction in Total.tsx.
                            const isCancelingExisting = false;
                            // For provision refunds there are no products, so fall back to the original transaction amount.
                            const refundAmount = getCustomerTotal() || originalTransaction?.amount || 0;

                            // Use reverseTransaction to properly reverse quantities using computeQuantity
                            const currentTransaction: Transaction = {
                                validator: parameters.user.name,
                                method: REFUND_KEYWORD,
                                amount: refundAmount,
                                createdDate: new Date().getTime(),
                                modifiedDate: 0,
                                currency: currencies[currencyIndex].label,
                                customerName: originalTransaction?.customerName,
                                products: products.current,
                            };

                            const reversedTransaction = reverseTransaction(currentTransaction);
                            // Replace current products with reversed ones
                            products.current.length = 0;
                            reversedTransaction.products.forEach((product) => {
                                products.current.push(product);
                            });

                            // Only print kitchen ticket if canceling an existing order
                            commitTransaction(reversedTransaction, isCancelingExisting);
                            closePopup();
                        }
                    });
                    break;
                case WAITING_KEYWORD:
                case 'METTRE ' + WAITING_KEYWORD:
                    // Sauvegarder la transaction avec le statut EN ATTENTE
                    // Use commitTransaction so delta ticket logic applies when editing a previously WAITING tx
                    commitTransaction(WAITING_KEYWORD);
                    closePopup();
                    break;
                case 'Espèces':
                    if (parameters.display?.showChange !== false) {
                        const cashTotal = getCustomerTotal().clean(currencies[currencyIndex].decimals);
                        openFullscreenPopup(
                            'Paiement en espèces',
                            [
                                <CashPaymentPopup
                                    key="cashPayment"
                                    total={cashTotal}
                                    onCancel={fallback}
                                    onConfirm={(cashAmount, changeAmount) => {
                                        const now = floorToSeconds(new Date().getTime());
                                        const transaction: Transaction = {
                                            validator: parameters.user.name,
                                            method: option,
                                            amount: cashTotal,
                                            createdDate: now,
                                            modifiedDate: now,
                                            currency: currencies[currencyIndex].label,
                                            products: products.current,
                                            cashAmount,
                                            change: changeAmount,
                                            ...(employerShare > 0 ? { employerShare } : {}),
                                        };
                                        commitTransaction(transaction);
                                        triggerCashDrawer();

                                        if (changeAmount > 0) {
                                            // Notify the customer-facing (back) display and keep the
                                            // change on screen until the next transaction starts
                                            holdChangeDisplay();
                                            postCustomerDisplay(
                                                buildCustomerDisplay(
                                                    cashTotal,
                                                    cashAmount,
                                                    changeAmount,
                                                    currencies[currencyIndex]
                                                )
                                            );

                                            openFullscreenPopup(
                                                'Monnaie à rendre',
                                                [
                                                    <ChangeDisplayPopup
                                                        key="changeDisplay"
                                                        total={cashTotal}
                                                        cashAmount={cashAmount}
                                                        change={changeAmount}
                                                        onClose={closePopup}
                                                    />,
                                                ],
                                                () => {},
                                                true
                                            );
                                        } else {
                                            closePopup();
                                        }
                                    }}
                                />,
                            ],
                            (index) => {
                                if (index < 0) fallback();
                            },
                            true
                        );
                    } else {
                        // Legacy cash behaviour: just commit the transaction
                        commitTransaction(option);
                        triggerCashDrawer();
                        closePopup();
                    }
                    break;
                default:
                    // Pour les modes de paiement normaux, enregistrer comme payé
                    commitTransaction(option);
                    closePopup();
                    break;
            }
        },
        [
            openQRCode,
            cancelOrConfirmPaiement,
            generate,
            commitTransaction,
            updateTransaction,
            closePopup,
            paymentMethods,
            openPopup,
            products,
            currencies,
            currencyIndex,
            getCustomerTotal,
            parameters.user.name,
            parameters.display?.showChange,
            parameters.display?.useTakeOut,
            reverseTransaction,
            currentCustomer,
            setCurrentCustomer,
            amount,
            openFullscreenPopup,
            transactions,
            getPrinterAddressByRole,
            printKitchenReceipt,
            orderId,
            setCounterServiceType,
            triggerCashDrawer,
            employerShare,
            openCustomerSearchPopup,
            finalizeProvisionPayment,
            finalizeDebitPayment,
            showProvisionSubOptions,
        ]
    );

    const addProvision = useCallback(() => {
        selectPayment(PROVISION_KEYWORD, () => {});
    }, [selectPayment]);

    // Apply fidelity points as a discount to the current cart.
    // Adds a negative product line "-Fidélité: -XX€" and deducts points from the
    // customer's local balance. The actual DB deduction happens in saveTransaction.
    const applyFidelity = useCallback(() => {
        const fidelityRate = parameters.fidelityRate ?? 0;
        if (fidelityRate <= 0) {
            openPopup('Fidélité', ["La fidélité n'est pas activée"]);
            return;
        }

        // Use getCustomerTotal() (after employer share deduction) so fidelity
        // only covers what the customer actually pays, not the employer's share.
        const currentTotal = getCustomerTotal();
        if (currentTotal <= 0) {
            openPopup('Fidélité', ['Aucun montant à payer']);
            return;
        }

        // Check if a fidelity product is already in the cart
        const existingFidelity = products.current.find((p) => p.category === FIDELITY_KEYWORD);
        if (existingFidelity) {
            openPopup('Fidélité', ['Fidélité déjà utilisée pour cette transaction']);
            return;
        }

        const doApplyFidelity = (customer: Customer) => {
            const points = customer.fidelityPoints ?? 0;
            if (points <= 0) {
                openPopup('Fidélité', ["Ce client n'a pas de points de fidélité"]);
                return;
            }

            const fidelityAmount = Math.min(points, currentTotal);
            if (fidelityAmount <= 0) {
                openPopup('Fidélité', ['Points insuffisants']);
                return;
            }

            // Add a negative product line for the fidelity deduction
            const fidelityProduct: Product = {
                label: FIDELITY_KEYWORD,
                category: FIDELITY_KEYWORD,
                amount: -fidelityAmount,
                quantity: 1,
                total: -fidelityAmount,
                discount: EmptyDiscount,
            };
            addProduct(fidelityProduct);

            // Deduct points from the customer's local balance
            setCurrentCustomer({
                ...customer,
                fidelityPoints: points - fidelityAmount,
            });
        };

        if (!currentCustomer) {
            openCustomerSearchPopup((customer) => doApplyFidelity(customer));
            return;
        }

        doApplyFidelity(currentCustomer);
    }, [
        parameters.fidelityRate,
        getCustomerTotal,
        products,
        addProduct,
        currentCustomer,
        setCurrentCustomer,
        openPopup,
        openCustomerSearchPopup,
    ]);

    // Function to handle partial payment
    const selectPaymentForPartial = useCallback(
        async (paymentMethod: string) => {
            if (!orderId || selectedOrderItems.length === 0) return;

            // Notify the customer-facing display about the payment type
            postCustomerDisplay(buildPaymentDisplay(paymentMethod, partialPaymentAmount, currencies[currencyIndex]));

            const showSuccess = (result: { success: boolean; message?: string }) => {
                closePopup();

                // Show success message
                openPopup(
                    'Paiement réussi',
                    [result.message || 'Paiement enregistré', 'Fermer la caisse'],
                    (index, option) => {
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
                    }
                );
            };

            const processPartialPayment = async (cashAmount?: number, changeAmount?: number) => {
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

                        if (cashAmount !== undefined && changeAmount !== undefined && changeAmount > 0) {
                            // Show the change on the customer-facing display before the success popup
                            holdChangeDisplay();
                            postCustomerDisplay(
                                buildCustomerDisplay(
                                    partialPaymentAmount,
                                    cashAmount,
                                    changeAmount,
                                    currencies[currencyIndex]
                                )
                            );

                            openFullscreenPopup(
                                'Monnaie à rendre',
                                [
                                    <ChangeDisplayPopup
                                        key="changeDisplayPartial"
                                        total={partialPaymentAmount}
                                        cashAmount={cashAmount}
                                        change={changeAmount}
                                        onClose={() => {
                                            setSelectedOrderItems([]);
                                            setPartialPaymentAmount(0);
                                            setShowPartialPaymentSelector(false);
                                            showSuccess(result);
                                        }}
                                    />,
                                ],
                                () => {},
                                true
                            );
                        } else {
                            // Reset selection after successful payment
                            setSelectedOrderItems([]);
                            setPartialPaymentAmount(0);
                            setShowPartialPaymentSelector(false);

                            showSuccess(result);
                        }
                    } else {
                        openPopup('Erreur', ['Échec du paiement : ' + (result.error || 'Erreur inconnue')]);
                    }
                } catch (error) {
                    console.error('Error processing partial payment:', error);
                    openPopup('Erreur', ['Erreur lors du traitement du paiement']);
                }
            };

            if (paymentMethod === 'Espèces' && parameters.display?.showChange !== false) {
                const total = partialPaymentAmount;
                openFullscreenPopup(
                    'Paiement en espèces',
                    [
                        <CashPaymentPopup
                            key="cashPaymentPartial"
                            total={total}
                            onCancel={() => setShowPartialPaymentSelector(true)}
                            onConfirm={(cashAmount, changeAmount) => {
                                processPartialPayment(cashAmount, changeAmount);
                                triggerCashDrawer();
                            }}
                        />,
                    ],
                    (index) => {
                        if (index < 0) setShowPartialPaymentSelector(true);
                    },
                    true
                );
                return;
            }

            processPartialPayment();
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
            currencies,
            currencyIndex,
            openFullscreenPopup,
            partialPaymentAmount,
            parameters.display?.showChange,
            triggerCashDrawer,
        ]
    );

    const pay = useCallback(() => {
        // Nouveau cycle de paiement: on déverrouille la sélection et le type de service
        paymentSelectionLockedRef.current = false;
        serviceTypeSelectedRef.current = false;

        // Check if we're in partial payment mode (orderId is set AND selector is shown)
        if (orderId && selectedOrderItems.length > 0 && showPartialPaymentSelector) {
            // Partial payment mode - show payment methods for the selected items
            const total = partialPaymentAmount;
            if (total && paymentMethods.length) {
                const paymentMethodsLabels = paymentMethods
                    .filter((item) => item.currency === currencies[currencyIndex].label && item.availability !== false)
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

            // On demande le type de service uniquement si l'option useTakeOut est activée.
            // Si l'option est désactivée, on force takeout (take_out = true en DB).
            const useTakeOut = parameters.display?.useTakeOut !== false;
            if (!orderId && !useTakeOut) {
                setCounterServiceType('takeout');
            }

            const total = getCustomerTotal();
            if (total && paymentMethods.length) {
                // Check if this order has already been partially paid
                if (orderId && orderData && orderData.paid_amount > 0) {
                    // Force partial payment mode - don't allow full payment on partially paid orders
                    setShowPartialPaymentSelector(true);
                    return;
                }

                const paymentMethodsLabels = paymentMethods
                    .filter((item) => item.currency === currencies[currencyIndex].label && item.availability !== false)
                    .map((item) => item.type);

                // Build the options list: payment methods, then debit, then a separator, then print and other actions
                const allOptions = [...paymentMethodsLabels];

                if (parameters.display?.showDebit !== false) allOptions.push(DEBIT_KEYWORD);

                allOptions.push('');

                // Receipts should only print on the cashier printer, not kitchen/bar.
                if (hasCashierPrinter()) {
                    allOptions.push(PRINT_KEYWORD + PRINT_NO_DETAIL, PRINT_KEYWORD + PRINT_WITH_DETAIL);
                }

                // Add PARTIAL PAYMENT option only if orderId is set AND order has at least 2 items
                if (orderId && orderData && orderData.items.length >= 2) {
                    allOptions.push('PAIEMENT PARTIEL');
                }

                // Add waiting and refund options based on display settings (default to true if not set)
                if (parameters.display?.showWaiting !== false) allOptions.push('METTRE ' + WAITING_KEYWORD);

                if (parameters.display?.showRefund !== false) allOptions.push(REFUND_KEYWORD);

                // Add fidelity option only if fidelity rate is configured
                if ((parameters.fidelityRate ?? 0) > 0) allOptions.push(USE_FIDELITY_KEYWORD);

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

                            // Handle USE FIDELITY option — apply fidelity discount
                            if (option === USE_FIDELITY_KEYWORD) {
                                closePopup();
                                applyFidelity();
                                return;
                            }

                            // Handle printer options
                            const isPrintOption =
                                option.startsWith(PRINT_KEYWORD) &&
                                (option.includes(PRINT_NO_DETAIL) || option.includes(PRINT_WITH_DETAIL));
                            if (isPrintOption) {
                                const showDetails = option.includes(PRINT_WITH_DETAIL);
                                if (showDetails) {
                                    // Print the receipt with details on the cashier printer
                                    printTransaction(undefined, true);
                                    updateTransaction(WAITING_KEYWORD);
                                    closePopup();
                                } else {
                                    // No detail: ask for meal count, then print only "X x repas complet"
                                    paymentSelectionLockedRef.current = false;
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
                                                printTransaction(undefined, false, mealCount);
                                                updateTransaction(WAITING_KEYWORD);
                                                closePopup();
                                            }
                                        );
                                    });
                                }
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
        getCustomerTotal,
        paymentMethods,
        hasCashierPrinter,
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
        parameters.display?.useTakeOut,
        setShowPartialPaymentSelector,
        partialPaymentAmount,
        setCounterServiceType,
        parameters.fidelityRate,
        applyFidelity,
    ]);

    // Pay directly with a specific method, bypassing the payment method popup.
    // Used by the desktop payment-icons top bar so each icon triggers payment in one click.
    const payWithMethod = useCallback(
        (method: string) => {
            // New payment cycle: unlock selection and service type
            paymentSelectionLockedRef.current = false;
            serviceTypeSelectedRef.current = false;

            // Partial payment mode
            if (orderId && selectedOrderItems.length > 0 && showPartialPaymentSelector) {
                if (paymentSelectionLockedRef.current) return;
                paymentSelectionLockedRef.current = true;
                selectPaymentForPartial(method);
                return;
            }

            // Normal payment mode — if order already partially paid, force partial selector
            if (orderId && orderData && orderData.paid_amount > 0) {
                setShowPartialPaymentSelector(true);
                return;
            }

            const useTakeOut = parameters.display?.useTakeOut !== false;
            if (!orderId && !useTakeOut) {
                setCounterServiceType('takeout');
            }

            if (paymentSelectionLockedRef.current) return;
            paymentSelectionLockedRef.current = true;
            selectPayment(method, pay);
        },
        [
            selectPayment,
            selectPaymentForPartial,
            orderId,
            selectedOrderItems,
            showPartialPaymentSelector,
            orderData,
            parameters.display?.useTakeOut,
            setCounterServiceType,
            setShowPartialPaymentSelector,
            pay,
        ]
    );

    useEffect(() => {
        if (error?.message === 'Transaction timed out') {
            cancelOrConfirmPaiement(pay);
        }
    }, [error, cancelOrConfirmPaiement, pay]);

    return {
        pay,
        canPay,
        canAddProduct,
        canAddProvision,
        addProvision,
        payProvisionWithMethod,
        applyFidelity,
        printTransaction,
        printKitchenReceipt,
        payWithMethod,
    };
};
