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
    const { currencies, currencyIndex } = useConfig();

    const NON_BREAKING_SPACE = '\u00a0';

    const amount = useMemo(() => {
        const num = value?.toString() ? parseFloat(value.toString()) : NaN;
        if (isNaN(num) || (num <= 0 && !showZero)) return NON_BREAKING_SPACE;
        if (typeof value === 'string') return value;
        return num.toString();
    }, [value, showZero]);
    const currency = useMemo(() => {
        return currencies[currencyIndex];
    }, [currencies, currencyIndex]);

    return amount !== NON_BREAKING_SPACE ? (
        <span className={className}>
            {decimals || currency.maxDecimals ? parseFloat(amount).toFixed(decimals ?? currency.maxDecimals) : amount}
            <span className="text-xl">{currency.symbol}</span>
        </span>
    ) : null;
};
