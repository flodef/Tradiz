import { FC, useMemo } from 'react';
import { useConfig } from '../hooks/useConfig';

export interface AmountProps {
    value: number | string | undefined;
    currency?: string;
    showZero?: boolean;
    decimals?: number;
    className?: string;
}

export const Amount: FC<AmountProps> = ({ className, value, showZero, decimals }) => {
    const { currency, maxDecimals } = useConfig();

    const NON_BREAKING_SPACE = '\u00a0';

    const amount = useMemo(() => {
        const num = value?.toString() ? parseFloat(value.toString()) : NaN;
        if (isNaN(num) || (num <= 0 && !showZero)) return NON_BREAKING_SPACE;
        if (typeof value === 'string') return value;
        return num.toString();
    }, [value, showZero]);

    return amount !== NON_BREAKING_SPACE ? (
        <span className={className}>
            {decimals || maxDecimals ? parseFloat(amount).toFixed(decimals ?? maxDecimals) : amount}
            <span className="text-xl">{currency}</span>
        </span>
    ) : null;
};
