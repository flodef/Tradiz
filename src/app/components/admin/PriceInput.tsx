'use client';

import { isValidPrice } from '@/app/utils/extensions';
import { getMainCurrencyStep } from '@/app/utils/priceStep';
import ValidatedInput from './ValidatedInput';

interface PriceCurrency {
    rate: number;
    decimals: number;
    maxValue?: number;
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
    const symbol = mainCurrency?.symbol ?? '';

    if (isReadOnly) {
        const formattedValue = parseFloat(String(value || '0')).toFixed(decimals);
        return (
            <span className="text-sm text-gray-500">
                {formattedValue}
                {symbol && ` ${symbol}`}
            </span>
        );
    }

    // Format the display value with the correct number of decimals.
    // ValidatedInput keeps a draftValue while focused, so the user can type
    // "4." without it being stripped — the formatted value only shows when
    // the input is not actively being edited.
    const numValue = parseFloat(String(value || '0'));
    const displayValue =
        !isNaN(numValue) && numValue !== 0
            ? numValue.toFixed(decimals)
            : value === '' || value === '0' || value === 0
              ? value
              : String(value);

    return (
        <ValidatedInput
            type="number"
            value={displayValue}
            onChange={onChange}
            placeholder={placeholder ?? (0).toFixed(decimals)}
            min={0}
            max={mainCurrency?.maxValue}
            step={priceStep}
            isReadOnly={isReadOnly}
            className={className}
            label={label ? (label.includes(symbol) ? label : `${label}${symbol ? ` (${symbol})` : ''}`) : undefined}
            validation={validation ?? isValidPrice}
            ref={ref}
        />
    );
}
