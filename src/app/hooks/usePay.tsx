import { useCallback, useEffect } from 'react';
import { QRCode } from '../components/QRCode';
import { useConfig } from './useConfig';
import { useData } from './useData';
import { usePopup } from './usePopup';
import { PaymentStatus, usePayment } from './useSolana';

export const usePay = () => {
    const { openPopup, closePopup } = usePopup();
    const { addPayment, getCurrentTotal, toCurrency } = useData();
    const { generate, paymentStatus, error, retry } = usePayment();
    const { paymentMethods } = useConfig();

    const openQRCode = useCallback(
        (onCancel: (onConfirm: () => void) => void, onConfirm: () => void) => {
            openPopup(
                'Paiement : ' + toCurrency(getCurrentTotal()),
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
        [addPayment, closePopup, generate, paymentStatus, toCurrency, getCurrentTotal, openPopup]
    );

    const cancelOrConfirmPaiement = useCallback(
        (onConfirm: () => void) => {
            openPopup(
                'Paiement : ' + toCurrency(getCurrentTotal()),
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
        [openPopup, toCurrency, getCurrentTotal, openQRCode, retry, paymentStatus]
    );

    const onPay = useCallback(() => {
        const total = getCurrentTotal();
        if (total) {
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

    return { onPay };
};
