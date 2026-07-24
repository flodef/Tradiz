import { Currency } from './interfaces';

export interface CustomerDisplayPayload {
    line1: string;
    line2: string;
}

const DISPLAY_WIDTH = 20;

function formatAmount(amount: number, currency: Currency): string {
    return amount.toCurrency(currency.decimals, currency.symbol).replace(/\s/g, '');
}

export function buildCustomerDisplay(
    total: number,
    cashAmount: number,
    change: number,
    currency: Currency
): CustomerDisplayPayload {
    const totalStr = formatAmount(total, currency);
    const changeStr = formatAmount(change, currency);

    // Keep within 20 chars per line, left/right aligned where possible.
    const line1 = `TOTAL ${totalStr}`.slice(0, DISPLAY_WIDTH).padEnd(DISPLAY_WIDTH);
    const line2 = `RENDU ${changeStr}`.slice(0, DISPLAY_WIDTH).padEnd(DISPLAY_WIDTH);

    return { line1, line2 };
}
