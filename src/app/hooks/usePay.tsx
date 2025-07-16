import { useCallback, useEffect, useMemo } from 'react';
import { QRCode } from '../components/QRCode';
import { IS_LOCAL, PRINT_KEYWORD, PROCESSING_KEYWORD, SEPARATOR, WAITING_KEYWORD } from '../utils/constants';
import { printReceipt } from '../utils/posPrinter';
import { useConfig } from './useConfig';
import { Crypto, PaymentStatus, useCrypto } from './useCrypto';
import { Transaction, useData } from './useData';
import { usePopup } from './usePopup';

export const usePay = () => {
    const { openPopup, closePopup } = usePopup();
    const { updateTransaction, getCurrentTotal, toCurrency, total, amount, selectedProduct, transactions } = useData();
    const { init, generate, refPaymentStatus, error, retry, crypto } = useCrypto();
    const { paymentMethods, currencies, currencyIndex, parameters, getPrintersNames, getPrinterAddresses } =
        useConfig();

    const canPay = useMemo(() => Boolean(total && !amount && !selectedProduct), [total, amount, selectedProduct]);
    const canAddProduct = useMemo(() => Boolean(amount && selectedProduct), [amount, selectedProduct]);

    const printTransactionReceipt = useCallback(
        async (printerName?: string, transaction?: Transaction) => {
            // Prepare receipt data
            const currentTransaction = transaction || transactions.find((item) => item.method === PROCESSING_KEYWORD);
            if (!currentTransaction) return { error: 'Aucune transaction à imprimer' };

            const printerAddresses = getPrinterAddresses(printerName);
            if (!printerAddresses.length) return { error: 'Imprimante non trouvée' };

            const receiptData = {
                shop: parameters.shop,
                transaction: currentTransaction,
                thanksMessage: parameters.thanksMessage,
                userName: parameters.user.name,
            };

            // Print the receipt
            return await printReceipt(printerAddresses, receiptData);
        },
        [parameters, transactions, getPrinterAddresses]
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
                        'IBAN : ' + paymentMethods.find((item) => item.method === 'Virement')?.address,
                        ['Valider paiement', 'Annuler paiement'],
                        (index) => {
                            if (index === 0) updateTransaction(option);
                        }
                    );
                    break;
                case PRINT_KEYWORD:
                    printTransaction(option);
                    updateTransaction(WAITING_KEYWORD);
                    break;
                default:
                    updateTransaction(option.includes(WAITING_KEYWORD) ? WAITING_KEYWORD : option);
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
        ]
    );

    const pay = useCallback(() => {
        const total = getCurrentTotal();
        if (total && paymentMethods.length) {
            const paymentMethodsLabels = paymentMethods
                .filter((item) => item.currency === currencies[currencyIndex].symbol)
                .map((item) => item.method)
                .concat(['', 'METTRE ' + WAITING_KEYWORD])
                .concat(getPrintersNames());
            if (paymentMethodsLabels.length === 1) {
                selectPayment(paymentMethodsLabels[0], pay);
            } else {
                openPopup(
                    'Paiement : ' + toCurrency(total),
                    paymentMethodsLabels,
                    (index, option) => {
                        if (index < 0) return;

                        selectPayment(option, pay);
                    },
                    true
                );
            }
        }
    }, [
        selectPayment,
        openPopup,
        getCurrentTotal,
        paymentMethods,
        getPrintersNames,
        toCurrency,
        currencies,
        currencyIndex,
    ]);

    useEffect(() => {
        if (error?.message === 'Transaction timed out') {
            cancelOrConfirmPaiement(pay);
        }
    }, [error, cancelOrConfirmPaiement, pay]);

    return { pay, canPay, canAddProduct, printTransaction };
};
