import { FC } from 'react';
import { Digits } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { Amount } from './Amount';
import { addPopupClass } from './Popup';
import { Separator } from './Separator';

export interface TotalProps {
    maxDecimals: Digits;
}

export const Total: FC<TotalProps> = ({ maxDecimals }) => {
    const { total, totalAmount } = useData();

    return (
        <div
            className={addPopupClass(
                'absolute inset-x-0 top-0 ' + (totalAmount.current ? 'active:bg-orange-300' : 'text-gray-300')
            )}
        >
            <div className="text-5xl truncate text-center font-bold py-3">
                Total : <Amount value={total} decimals={maxDecimals} showZero />
            </div>
            <Separator />
        </div>
    );
};
