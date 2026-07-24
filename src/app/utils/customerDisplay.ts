import { Currency } from './interfaces';

export interface CustomerDisplayPayload {
    line1: string;
    line2: string;
}

const DISPLAY_WIDTH = 20;

function formatAmount(amount: number, currency: Currency): string {
    return amount.toCurrency(currency.decimals, currency.symbol).replace(/\s/g, '');
}

// Build a 20-char line with the label on the left and the amount right-aligned.
// The amount is prioritised: if space is tight the label is truncated, never the value.
function formatLine(label: string, value: string): string {
    const maxLabel = Math.max(0, DISPLAY_WIDTH - value.length - 1);
    const trimmedLabel = label.slice(0, maxLabel);
    const padding = Math.max(1, DISPLAY_WIDTH - trimmedLabel.length - value.length);
    return `${trimmedLabel}${' '.repeat(padding)}${value}`.slice(0, DISPLAY_WIDTH);
}

export function buildCustomerDisplay(
    total: number,
    cashAmount: number,
    change: number,
    currency: Currency
): CustomerDisplayPayload {
    const totalStr = formatAmount(total, currency);
    const changeStr = formatAmount(change, currency);

    return {
        line1: formatLine('TOTAL', totalStr),
        line2: formatLine('RENDU', changeStr),
    };
}
