import { useCallback, useEffect, useMemo } from 'react';
import { QRCode } from '../components/QRCode';
import { useConfig } from './useConfig';
import { Crypto, PaymentStatus, useCrypto } from './useCrypto';
import { useData } from './useData';
import { usePopup } from './usePopup';

export const usePay = () => {
    const { openPopup, closePopup } = usePopup();
    const { addPayment, getCurrentTotal, toCurrency, total, amount, selectedCategory } = useData();
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
                        addPayment('Crypto');
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
            addPayment,
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
                            addPayment('Crypto');
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
        [openPopup, toCurrency, getCurrentTotal, openQRCode, retry, closePopup, init, addPayment]
    );

    const selectPayment = useCallback(
        (option: string, fallback: () => void) => {
            if (option === Crypto.Solana || option === Crypto.June) {
                generate(option);
                openQRCode(cancelOrConfirmPaiement, fallback);
            } else if (option === 'Virement') {
                openPopup(
                    'IBAN : ' + paymentMethods.find((item) => item.method === 'Virement')?.address ?? '',
                    ['Valider paiement', 'Annuler paiement'],
                    (index) => {
                        if (index === 0) {
                            addPayment(option);
                        }
                    }
                );
            } else {
                addPayment(option);
                closePopup();
            }
        },
        [openQRCode, cancelOrConfirmPaiement, generate, addPayment, closePopup, paymentMethods, openPopup]
    );

    const pay = useCallback(() => {
        const total = getCurrentTotal();
        if (total && paymentMethods.length) {
            const paymentMethodsLabels = paymentMethods.map((item) => item.method);
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
    }, [selectPayment, openPopup, getCurrentTotal, paymentMethods, toCurrency]);

    useEffect(() => {
        if (error?.message === 'Transaction timed out') {
            cancelOrConfirmPaiement(pay);
        }
    }, [error, cancelOrConfirmPaiement, pay]);

    return { pay, canPay, canAddProduct };
};
