import QRCodeStyling from '@solana/qr-code-styling';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { PaymentStatus, usePayment } from '../hooks/usePayment';
import { createQROptions } from '../utils/createQR';

const minSize = 320;

interface CheckmarkProps {
    isOK: boolean;
    size: number;
}

const Checkmark: FC<CheckmarkProps> = ({ size, isOK = true }) => {
    const { errorText } = usePayment();

    const text = isOK ? 'Paiement reçu' : `Paiement non reçu : ${errorText}\nRéessayer ?`;
    return (
        <div className="flex flex-col items-center">
            <svg
                className={
                    'my-4 rounded-[50%] block stroke-2 stroke-white' +
                    (isOK
                        ? ' shadow-[inset_0px_0px_0px_rgba(132,204,22,1)] animate-fillGreen'
                        : ' shadow-[inset_0px_0px_0px_rgba(239,68,68,1)] animate-fillRed')
                }
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 52 52"
                strokeMiterlimit="10"
                width={size}
                height={size}
            >
                <circle
                    className={`stroke-2 fill-none animate-strokeCircle ${isOK ? 'stroke-lime-500' : 'stroke-red-500'}`}
                    cx="26"
                    cy="26"
                    r="25"
                    fill="none"
                    strokeMiterlimit="10"
                    strokeDasharray={size + 110}
                    strokeDashoffset={size + 110}
                />
                <path
                    className="origin-[50%_50%] animate-strokeCheck"
                    fill="none"
                    d={isOK ? 'M14.1 27.2l7.1 7.2 16.7-16.8' : 'M16 16 36 36 M36 16 16 36'}
                    strokeDasharray={size - 8}
                    strokeDashoffset={size - 8}
                />
            </svg>
            {text.split('\n').map((item) => (
                <p className={isOK ? 'text-lime-500' : 'text-red-500'} key={item}>
                    {item}
                </p>
            ))}
        </div>
    );
};

export const QRCode: FC = () => {
    const { paymentStatus } = usePayment();

    const [size, setSize] = useState(() =>
        typeof window === 'undefined' ? minSize : Math.min(window.screen.availWidth - 48, minSize)
    );
    useEffect(() => {
        const listener = () => setSize(Math.min(window.screen.availWidth - 48, minSize));

        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    }, []);

    const { url } = usePayment();
    const options = useMemo(
        () =>
            createQROptions(
                url,
                size,
                'transparent',
                '#34A5FF', // TODO : '#2A2A2A',
                {
                    type: 'linear',
                    colorStops: [
                        { offset: 0, color: '#9945FF' },
                        { offset: 1, color: '#14F195' },
                    ],
                } // TODO : undefined
            ),
        [url, size]
    );

    const qr = useMemo(() => new QRCodeStyling(), []);
    useEffect(() => qr.update(options), [qr, options]);

    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (ref.current && options) {
            qr.append(ref.current);
        }
    }, [ref, qr, options]);

    return paymentStatus.current === PaymentStatus.Pending ? (
        <div id="tata" className="flex flex-col">
            <div ref={ref} className="rounded-2xl" />
            <div>Annuler</div>
        </div>
    ) : paymentStatus.current !== PaymentStatus.New ? (
        <Checkmark isOK={paymentStatus.current !== PaymentStatus.Error} size={size * 0.9} />
    ) : null;
};
