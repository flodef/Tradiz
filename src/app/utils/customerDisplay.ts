import { Currency, Product } from './interfaces';

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

function padLine(text: string): string {
    return text.slice(0, DISPLAY_WIDTH).padEnd(DISPLAY_WIDTH, ' ');
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

// Idle display: shop name across 2 lines of 20 chars (40 total), or "Fermé" if closed.
export function buildIdleDisplay(shopName: string, isClosed: boolean): CustomerDisplayPayload {
    if (isClosed) {
        return { line1: padLine(''), line2: padLine('Fermé') };
    }
    const name = shopName.slice(0, DISPLAY_WIDTH * 2);
    return {
        line1: padLine(name.slice(0, DISPLAY_WIDTH)),
        line2: padLine(name.slice(DISPLAY_WIDTH)),
    };
}

// Transaction display: last product name on line1, total on line2.
export function buildTransactionDisplay(
    products: Product[],
    total: number,
    currency: Currency
): CustomerDisplayPayload {
    const lastProduct = products.at(-1);
    const productLabel = lastProduct?.label ?? '';
    const totalStr = formatAmount(total, currency);
    return {
        line1: padLine(productLabel),
        line2: formatLine('TOTAL', totalStr),
    };
}

// Payment display: shows a payment-specific message.
export function buildPaymentDisplay(paymentType: string, total: number, currency: Currency): CustomerDisplayPayload {
    const totalStr = formatAmount(total, currency);
    const messages: Record<string, string> = {
        Espèces: 'Reglement',
        CB: 'Inserez votre CB',
        'Carte bancaire': 'Inserez votre CB',
        Virement: 'Virement',
    };
    const msg = messages[paymentType] ?? `Paiement ${paymentType}`;
    return {
        line1: padLine(msg),
        line2: formatLine('TOTAL', totalStr),
    };
}
