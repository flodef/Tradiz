import { useCallback, useEffect, useMemo } from 'react';
import { QRCode } from '../components/QRCode';
import { WAITING_KEYWORD } from '../utils/constants';
import { useConfig } from './useConfig';
import { Crypto, PaymentStatus, useCrypto } from './useCrypto';
import { useData } from './useData';
import { usePopup } from './usePopup';

export const usePay = () => {
    const { openPopup, closePopup } = usePopup();
    const { updateTransaction, getCurrentTotal, toCurrency, total, amount, selectedCategory, addProduct } = useData();
    const { init, generate, refPaymentStatus, error, retry, crypto } = useCrypto();
    const { paymentMethods } = useConfig();

    const canPay = useMemo(() => total && !amount && !selectedCategory, [total, amount, selectedCategory]);
    const canAddProduct = useMemo(() => amount && selectedCategory, [amount, selectedCategory]);

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
            openPopup(
                'Paiement : ' + toCurrency(getCurrentTotal()),
                ['Attendre paiement', 'Changer mode paiement', 'Valider paiement', 'Annuler paiement'],
                (index) => {
                    switch (index) {
                        case 1:
                            onConfirm();
                            init();
                            break;
                        case 2:
                            updateTransaction('Crypto');
                            closePopup(init);
                            break;
                        case 3:
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
        [openPopup, toCurrency, getCurrentTotal, openQRCode, retry, closePopup, init, updateTransaction]
    );

    const selectPayment = useCallback(
        (option: string, fallback: () => void) => {
            switch (option) {
                case Crypto.Solana:
                case Crypto.June:
                    generate(option);
                    openQRCode(cancelOrConfirmPaiement, fallback);
                    break;
                case 'Virement':
                    openPopup(
                        'IBAN : ' + paymentMethods.find((item) => item.method === 'Virement')?.address ?? '',
                        ['Valider paiement', 'Annuler paiement'],
                        (index) => {
                            if (index === 0) {
                                updateTransaction(option);
                            }
                        }
                    );
                    break;
                default:
                    updateTransaction(option.includes(WAITING_KEYWORD) ? WAITING_KEYWORD : option);
                    closePopup();
                    break;
            }
        },
        [openQRCode, cancelOrConfirmPaiement, generate, updateTransaction, closePopup, paymentMethods, openPopup]
    );

    const pay = useCallback(() => {
        if (canAddProduct) {
            addProduct(selectedCategory);
        }

        const total = getCurrentTotal();
        if (total && paymentMethods.length) {
            const paymentMethodsLabels = paymentMethods
                .map((item) => item.method)
                .concat(['', 'METTRE ' + WAITING_KEYWORD]);
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
        toCurrency,
        canAddProduct,
        addProduct,
        selectedCategory,
    ]);

    useEffect(() => {
        if (error?.message === 'Transaction timed out') {
            cancelOrConfirmPaiement(pay);
        }
    }, [error, cancelOrConfirmPaiement, pay]);

    return { pay, canPay, canAddProduct };
};
