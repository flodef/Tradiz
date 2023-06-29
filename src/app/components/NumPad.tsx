import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Digits } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { BackspaceIcon } from '../images/BackspaceIcon';
import { WalletIcon } from '../images/WalletIcon';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isMobileDevice } from '../utils/mobile';
import { Amount } from './Amount';
import { addPopupClass } from './Popup';
import { usePopup } from '../hooks/usePopup';

interface NumPadInputButton {
    input: Digits | '.';
    onInput(key: Digits | '.'): void;
}

const NumPadButton: FC<NumPadInputButton> = ({ input, onInput }) => {
    const onClick = useCallback(() => {
        if (!isFullscreen() && isMobileDevice()) {
            requestFullscreen();
        }
        onInput(input);
    }, [onInput, input]);
    return (
        <>
            <div
                className="w-20 h-20 active:bg-lime-300 rounded-2xl border border-lime-500 relative flex justify-center m-3 items-center font-semibold text-3xl"
                style={{ borderWidth: 'medium' }}
                onClick={onClick}
            >
                {input}
            </div>
        </>
    );
};

export interface NumPadProps {
    maxDecimals: Digits;
    maxValue: number;
    paymentMethod: string[];
}

export const NumPad: FC<NumPadProps> = ({ maxDecimals, maxValue, paymentMethod }) => {
    const { currentAmount, totalAmount, numPadValue, updateAmount, clearAmount, clearTotal, addPayment } = useData();
    const { openPopup } = usePopup();

    maxValue *= Math.pow(10, maxDecimals);

    const regExp = useMemo(() => new RegExp('^\\d*([.,]\\d{0,' + maxDecimals + '})?$'), [maxDecimals]);

    const [value, setValue] = useState('0');
    const onInput = useCallback(
        (key: Digits | '.') => {
            setValue((value) => {
                let newValue = (value + key).trim().replace(/^0{2,}/, '0');
                if (newValue) {
                    newValue = /^[.,]/.test(newValue) ? `0${newValue}` : newValue.replace(/^0+(\d)/, '$1');
                    if (regExp.test(newValue)) return parseFloat(newValue) <= maxValue ? newValue : maxValue.toString();
                }
                return value;
            });
        },
        [regExp]
    );
    const onBackspace = useCallback(() => {
        if (currentAmount.current) {
            clearAmount();
        } else if (totalAmount.current) {
            clearTotal();
        }
    }, []);

    const onPay = useCallback(() => {
        if (totalAmount.current && !currentAmount.current) {
            openPopup('Paiement : ' + totalAmount.current + '€', paymentMethod, addPayment);
        }
    }, []);

    useEffect(() => {
        updateAmount(parseInt(value) / Math.pow(10, maxDecimals));
    }, [value, maxDecimals]);
    useEffect(() => {
        if (numPadValue === 0) {
            setValue('0');
        }
    }, [numPadValue]);

    const NumPadList: Digits[][] = [
        [7, 8, 9],
        [4, 5, 6],
        [1, 2, 3],
    ];

    let sx = 'w-20 h-20 rounded-2xl flex justify-center m-3 items-center ';
    const s1 =
        sx + (currentAmount.current || totalAmount.current ? 'active:bg-lime-300 text-lime-500' : 'text-gray-300');
    const s2 =
        sx + (totalAmount.current && !currentAmount.current ? 'active:bg-lime-300 text-lime-500' : 'text-gray-300');

    return (
        <div className={addPopupClass('absolute inset-0 top-20 bottom-28 flex flex-col justify-evenly')}>
            <div className="text-4xl text-center font-bold pt-0">
                <Amount value={numPadValue} decimals={maxDecimals} showZero />
            </div>

            <div className="">
                {NumPadList.map((row, index) => (
                    <div className="flex justify-evenly" key={index}>
                        {row.map((input) => (
                            <NumPadButton input={input} onInput={onInput} key={input} />
                        ))}
                    </div>
                ))}
                <div className="flex justify-evenly">
                    <div className={s1} onClick={onBackspace}>
                        <BackspaceIcon />
                    </div>
                    <NumPadButton input={0} onInput={onInput} />
                    <div className={s2} onClick={onPay}>
                        <WalletIcon />
                    </div>
                </div>
            </div>
        </div>
    );
};
