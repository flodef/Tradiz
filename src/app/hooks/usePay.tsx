import { useCallback, useEffect } from 'react';
import { useData } from './useData';
import { PaymentStatus, usePayment } from './usePayment';
import { usePopup } from './usePopup';
import { useConfig } from './useConfig';
import { QRCode } from '../components/QRCode';

export const usePay = () => {
    const { openPopup, closePopup } = usePopup();
    const { total, amount, addPayment, toCurrency } = useData();
    const { generate, paymentStatus, error, retry } = usePayment();
    const { paymentMethods } = useConfig();

    const openQRCode = useCallback(
        (onCancel: (onConfirm: () => void) => void, onConfirm: () => void) => {
            openPopup(
                'Paiement : ' + toCurrency(total),
                [<QRCode key="QRCode" />],
                () => {
                    if (paymentStatus.current === PaymentStatus.Pending) {
                        onCancel(onConfirm);
                    } else if (paymentStatus.current === PaymentStatus.Error) {
                        generate();
                    } else {
                        addPayment('Crypto');
                        closePopup(() => (paymentStatus.current = PaymentStatus.New));
                    }
                },
                true
            );
        },
        [addPayment, closePopup, generate, paymentStatus, toCurrency, total, openPopup]
    );

    const cancelOrConfirmPaiement = useCallback(
        (onConfirm: () => void) => {
            openPopup(
                'Paiement : ' + toCurrency(total),
                ['Attendre paiement', 'Annuler paiement'],
                (index) => {
                    if (index === 1) {
                        onConfirm();
                        paymentStatus.current = PaymentStatus.New;
                    } else {
                        retry();
                        openQRCode(cancelOrConfirmPaiement, onConfirm);
                    }
                },
                true
            );
        },
        [openPopup, toCurrency, total, openQRCode, retry, paymentStatus]
    );

    const onPay = useCallback(() => {
        if (total && !amount) {
            openPopup(
                'Paiement : ' + toCurrency(total),
                paymentMethods,
                (index, option) => {
                    if (index < 0) return;

                    if (option === 'Crypto') {
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
        amount,
        openPopup,
        closePopup,
        total,
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

    return { onPay };
};
