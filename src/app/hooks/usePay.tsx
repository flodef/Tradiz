import { useCallback, useEffect, useMemo } from 'react';
import { QRCode } from '../components/QRCode';
import { useConfig } from './useConfig';
import { Crypto, PaymentStatus, usePayment } from './useCrypto';
import { useData } from './useData';
import { usePopup } from './usePopup';

export const usePay = () => {
    const { openPopup, closePopup } = usePopup();
    const { addPayment, getCurrentTotal, toCurrency, total, amount, selectedCategory } = useData();
    const { init, generate, refPaymentStatus, error, retry, setCrypto } = usePayment();
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
                            generate();
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
        [addPayment, closePopup, generate, retry, refPaymentStatus, toCurrency, getCurrentTotal, openPopup, init]
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
                setCrypto(option);
                generate();
                openQRCode(cancelOrConfirmPaiement, fallback);
            } else {
                addPayment(option);
                closePopup();
            }
        },
        [openQRCode, cancelOrConfirmPaiement, generate, addPayment, closePopup, setCrypto]
    );

    const Pay = useCallback(() => {
        const total = getCurrentTotal();
        if (total && paymentMethods.length) {
            const paymentMethodsLabels = paymentMethods.map((item) => item.method);
            if (paymentMethodsLabels.length === 1) {
                selectPayment(paymentMethodsLabels[0], Pay);
            } else {
                openPopup(
                    'Paiement : ' + toCurrency(total),
                    paymentMethodsLabels,
                    (index, option) => {
                        if (index < 0) return;

                        selectPayment(option, Pay);
                    },
                    true
                );
            }
        }
    }, [selectPayment, openPopup, getCurrentTotal, paymentMethods, toCurrency]);

    useEffect(() => {
        if (error?.message === 'Transaction timed out') {
            cancelOrConfirmPaiement(Pay);
        }
    }, [error, cancelOrConfirmPaiement, Pay]);

    return { Pay, canPay, canAddProduct };
};
