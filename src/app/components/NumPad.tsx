import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import { BackspaceIcon } from '../images/BackspaceIcon';
import { WalletIcon } from '../images/WalletIcon';
import { Digits } from '../utils/config';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isMobileDevice } from '../utils/mobile';
import { Amount } from './Amount';

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
}

export const NumPad: FC<NumPadProps> = ({ maxDecimals, maxValue }) => {
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
    const { currentAmount, totalAmount, numPadValue, setNumPadValue, clearTotal } = useData();
    const onBackspace = useCallback(() => {
        if (currentAmount.current) {
            setValue('0');
        } else {
            clearTotal();
        }
    }, []);

    const onPay = useCallback(() => {
        if (totalAmount.current) {
            setValue('0');
            clearTotal();
        }
    }, []);

    useEffect(() => {
        const v = parseInt(value) / Math.pow(10, maxDecimals);
        currentAmount.current = v;
        setNumPadValue(v);
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

    let s = 'w-20 h-20 rounded-2xl flex justify-center m-3 items-center ';
    const s1 =
        s + (currentAmount.current || totalAmount.current ? 'active:bg-lime-300 text-lime-500' : 'text-gray-300');
    const s2 = s + (totalAmount.current ? 'active:bg-lime-300 text-lime-500' : 'text-gray-300');

    return (
        <div className="absolute inset-0 top-20 bottom-28 flex flex-col justify-evenly">
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
