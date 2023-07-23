import { useCallback, useEffect, useMemo } from 'react';
import { QRCode } from '../components/QRCode';
import { useConfig } from './useConfig';
import { useData } from './useData';
import { usePopup } from './usePopup';
import { PaymentStatus, Solana, usePayment } from './useSolana';

export const usePay = () => {
    const { openPopup, closePopup } = usePopup();
    const { addPayment, getCurrentTotal, toCurrency, total, amount, selectedCategory } = useData();
    const { init, generate, refPaymentStatus, error, retry } = usePayment();
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
                            setTimeout(init, 200);
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
                ['Attendre paiement', 'Changer mode paiement', 'Annuler paiement'],
                (index) => {
                    if (index === 1) {
                        onConfirm();
                        init();
                    } else if (index === 2) {
                        closePopup(init);
                    } else {
                        retry();
                        openQRCode(cancelOrConfirmPaiement, onConfirm);
                    }
                },
                true
            );
        },
        [openPopup, toCurrency, getCurrentTotal, openQRCode, retry, closePopup, init]
    );

    const onPay = useCallback(() => {
        const total = getCurrentTotal();
        if (total) {
            openPopup(
                'Paiement : ' + toCurrency(total),
                paymentMethods.map((item) => item.method),
                (index, option) => {
                    if (index < 0) return;

                    if (option === Solana) {
                        generate();
                        openQRCode(cancelOrConfirmPaiement, onPay);
                    } else {
                        addPayment(option);
                        closePopup();
                    }
                },
                true
            );
        }
    }, [
        openPopup,
        closePopup,
        getCurrentTotal,
        addPayment,
        paymentMethods,
        toCurrency,
        generate,
        openQRCode,
        cancelOrConfirmPaiement,
    ]);

    useEffect(() => {
        if (error?.message === 'Transaction timed out') {
            cancelOrConfirmPaiement(onPay);
        }
    }, [error, cancelOrConfirmPaiement, onPay]);

    return { onPay, canPay, canAddProduct };
};
