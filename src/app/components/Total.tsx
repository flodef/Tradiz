import { FC } from 'react';
import { useData } from '../hooks/useData';
import { Digits } from '../utils/config';
import { Amount } from './Amount';

export interface TotalProps {
    maxDecimals: Digits;
}

export const Total: FC<TotalProps> = ({ maxDecimals }) => {
    const { total } = useData();
    let s = 'absolute inset-x-0 top-0 ';
    s += total ? 'active:bg-orange-300' : 'text-gray-300';
    return (
        <div className={s}>
            <div className="text-5xl text-center font-bold py-3">
                Total : <Amount value={total} decimals={maxDecimals} showZero />
            </div>
            <hr className="border-orange-300" />
        </div>
    );
};
