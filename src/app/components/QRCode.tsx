import QRCodeStyling from '@solana/qr-code-styling';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { PaymentStatus, usePayment } from '../hooks/useSolana';
import { ColorScheme, useWindowParam } from '../hooks/useWindowParam';
import { createQROptions } from '../utils/createQR';
import { useWindowSize } from '../hooks/useWindowSize';

const minSize = 400;

interface LoadingCircleProps {
    size: number;
}
const LoadingCircle: FC<LoadingCircleProps> = ({ size }) => {
    return (
        <div style={{ width: size, height: size + 72 }}>
            <div
                className={
                    'absolute border-transparent rounded-full border-[10px] my-4 mb-11 ' +
                    "before:content-[''] before:absolute before:top-[-10px] before:left-[-10px] before:w-[inherit] before:h-[inherit] " +
                    'before:border-transparent before:border-t-ok before:border-r-ok before:rounded-full before:border-[10px] ' +
                    'before:animate-spin '
                }
                style={{ width: size, height: size }}
            />
        </div>
    );
};

interface CheckmarkProps {
    size: number;
    isOK?: boolean;
}

const Checkmark: FC<CheckmarkProps> = ({ size, isOK = true }) => {
    const { errorText } = usePayment();

    const text = isOK ? 'Paiement reçu' : `Paiement non reçu${errorText ? ' : ' + errorText : ''}\nRéessayer ?`;
    return (
        <div className="flex flex-col items-center">
            <svg
                className={
                    'my-4 rounded-[50%] block stroke-2 stroke-white ' +
                    (isOK
                        ? 'shadow-[inset_0px_0px_0px_rgba(132,204,22,1)] animate-fillGreen'
                        : 'shadow-[inset_0px_0px_0px_rgba(239,68,68,1)] animate-fillRed')
                }
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 52 52"
                strokeMiterlimit="10"
                width={size}
                height={size}
            >
                <circle
                    className={`stroke-2 fill-none animate-strokeCircle ${isOK ? 'stroke-ok' : 'stroke-error'}`}
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
                <p className={(isOK ? 'text-ok' : 'text-error') + ' mb-3'} key={item}>
                    {item}
                </p>
            ))}
        </div>
    );
};

export const QRCode: FC = () => {
    const { paymentStatus } = usePayment();
    const { width, height, colorScheme, isOnline } = useWindowParam();

    const size = useMemo(
        () =>
            Math.min(
                (width > 48 ? width : window.screen.availWidth) - 48,
                (height > 48 ? height : window.screen.availHeight) - 48,
                minSize
            ),
        [width, height]
    );

    const [qrLow, setQrLow] = useState('');
    const [qrHigh, setQrHigh] = useState('');
    const [qrWriting, setQrWriting] = useState('');

    useEffect(() => {
        if (colorScheme === ColorScheme.Light) {
            // light mode
            setQrLow('#ea580c'); // orange-600
            setQrHigh('#a3e635'); // lime-400
            setQrWriting('#84cc16'); // lime-500
        } else {
            // dark mode
            setQrLow('#fde047'); // yellow-300
            setQrHigh('#a3e635'); // lime-400
            setQrWriting('#f97316'); // orange-500
        }
    }, [colorScheme]);

    const [qrLow, setQrLow] = useState('');
    const [qrHigh, setQrHigh] = useState('');
    const [qrWriting, setQrWriting] = useState('');

    useEffect(() => {
        if (colorScheme === ColorScheme.Light) {
            // light mode
            setQrLow('#ea580c'); // orange-600
            setQrHigh('#a3e635'); // lime-400
            setQrWriting('#84cc16'); // lime-500
        } else {
            // dark mode
            setQrLow('#fde047'); // yellow-300
            setQrHigh('#a3e635'); // lime-400
            setQrWriting('#f97316'); // orange-500
        }
    }, [colorScheme]);

    const [qrLow, setQrLow] = useState('');
    const [qrHigh, setQrHigh] = useState('');
    const [qrWriting, setQrWriting] = useState('');

    useEffect(() => {
        if (colorScheme === ColorScheme.Light) {
            // light mode
            setQrLow('#ea580c'); // orange-600
            setQrHigh('#a3e635'); // lime-400
            setQrWriting('#84cc16'); // lime-500
        } else {
            // dark mode
            setQrLow('#fde047'); // yellow-300
            setQrHigh('#a3e635'); // lime-400
            setQrWriting('#f97316'); // orange-500
        }
    }, [colorScheme]);

    const { url } = usePayment();
    const options = useMemo(
        () =>
            createQROptions(url, size, 'transparent', qrWriting, {
                type: 'linear',
                colorStops: [
                    { offset: 0, color: qrLow },
                    { offset: 1, color: qrHigh },
                ],
            }),
        [url, size, qrLow, qrHigh, qrWriting]
    );

    const qr = useMemo(() => new QRCodeStyling(), []);
    useEffect(() => qr.update(options), [qr, options]);

    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (ref.current && options) {
            qr.append(ref.current);
        }
    }, [ref, qr, options]);

    return paymentStatus === PaymentStatus.Pending ? (
        <div className="flex flex-col">
            <div ref={ref} className="rounded-2xl" />
            <div>Options | {isOnline ? 'Connecté' : 'Hors-Connection'}</div>
        </div>
    ) : paymentStatus === PaymentStatus.Finalized || paymentStatus === PaymentStatus.Error ? (
        <Checkmark isOK={paymentStatus !== PaymentStatus.Error} size={size * 0.8} />
    ) : (
        <LoadingCircle size={size * 0.8} />
    );
};
