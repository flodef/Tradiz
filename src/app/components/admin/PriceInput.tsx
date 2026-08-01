'use client';

import { isValidPrice } from '@/app/utils/extensions';
import { getMainCurrencyStep } from '@/app/utils/priceStep';
import ValidatedInput from './ValidatedInput';

interface PriceCurrency {
    rate: number;
    decimals: number;
    symbol?: string;
}

interface PriceInputProps {
    value: string | number;
    onChange: (value: string | number) => void;
    currencies: PriceCurrency[];
    isReadOnly?: boolean;
    className?: string;
    label?: string;
    placeholder?: string;
    validation?: (value: string | number) => boolean;
    ref?: (el: HTMLInputElement | null) => void;
}

export default function PriceInput({
    value,
    onChange,
    currencies,
    isReadOnly = false,
    className,
    label,
    placeholder,
    validation,
    ref,
}: PriceInputProps) {
    const mainCurrency = currencies.find((c) => c.rate === 1) ?? currencies[0];
    const decimals = mainCurrency?.decimals ?? 2;
    const priceStep = getMainCurrencyStep(currencies);
    const formattedValue = parseFloat(String(value || '0')).toFixed(decimals);
    const symbol = mainCurrency?.symbol ?? '';

    if (isReadOnly) {
        return (
            <span className="text-sm text-gray-500">
                {formattedValue}
                {symbol && ` ${symbol}`}
            </span>
        );
    }

    return (
        <ValidatedInput
            type="number"
            value={formattedValue}
            onChange={onChange}
            placeholder={placeholder ?? (0).toFixed(decimals)}
            min={0}
            step={priceStep}
            isReadOnly={isReadOnly}
            className={className}
            label={label ? `${label}${symbol ? ` (${symbol})` : ''}` : undefined}
            validation={validation ?? isValidPrice}
            ref={ref}
        />
    );
}
