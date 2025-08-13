import { FC, MouseEventHandler, useCallback, useMemo } from 'react';
import { useConfig } from '../hooks/useConfig';

export interface AmountProps {
    className?: string;
    value: number | string | undefined;
    showZero?: boolean;
    decimals?: number;
    onClick?: () => void;
}

export const Amount: FC<AmountProps> = ({ className, value, showZero, decimals, onClick }) => {
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

    const handleClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();

            if (onClick) onClick();
        },
        [onClick]
    );

    return amount !== NON_BREAKING_SPACE ? (
        <span className={className} onClick={handleClick} onContextMenu={handleClick}>
            {decimals || currency.decimals ? parseFloat(amount).toFixed(decimals ?? currency.decimals) : amount}
            <span className="text-xl">{currency.symbol}</span>
        </span>
    ) : null;
};
