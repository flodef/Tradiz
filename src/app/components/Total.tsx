import { FC } from 'react';
import { useData } from '../hooks/useData';
import { Amount } from './Amount';

export const Total: FC = () => {
    const { total } = useData();
    return (
        <div className="absolute inset-x-0 top-0">
            <div className="text-5xl text-center font-bold py-3">
                Total : <Amount value={total} showZero />
            </div>
            <hr className="border-orange-300" />
        </div>
    );
};
