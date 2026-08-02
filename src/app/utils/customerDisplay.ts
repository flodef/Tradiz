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

// Transaction display: the product being rung up on line1, running total on line2.
export function buildTransactionDisplay(
    product: Product | undefined,
    total: number,
    currency: Currency
): CustomerDisplayPayload {
    const totalStr = formatAmount(total, currency);
    return {
        line1: padLine(product?.label ?? ''),
        line2: formatLine('TOTAL', totalStr),
    };
}

// Payment method labels are free text coming from the database (see PAYMENT_TYPES for the
// canonical ones), so they are matched on a normalised (lowercased, accent-free) form against
// known aliases rather than exact keys. Order matters: the first matching entry wins.
const PAYMENT_MESSAGES: { aliases: string[]; message: string }[] = [
    { aliases: ['vacances'], message: 'Chèque vacances' },
    { aliases: ['ticket', 'resto'], message: 'Titre restaurant' },
    { aliases: ['cb', 'carte', 'bancaire', 'visa', 'mastercard', 'tpe'], message: 'Insérez votre carte' },
    { aliases: ['espece', 'cash', 'liquide'], message: 'Règlement en espèces' },
    { aliases: ['cheque'], message: 'Règlement par chèque' },
    { aliases: ['virement', 'iban'], message: 'Virement bancaire' },
    { aliases: ['solana', 'june', 'crypto'], message: 'Scannez le QR code' },
    { aliases: ['debit'], message: 'Paiement sur compte' },
    { aliases: ['provision'], message: 'Approvisionnement' },
];

function normalize(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '');
}

// Resolve the customer-facing message for a payment method label.
// Falls back to the label itself, which is always more useful than a generic wording.
export function getPaymentMessage(paymentType: string): string {
    const normalized = normalize(paymentType);
    const match = PAYMENT_MESSAGES.find(({ aliases }) => aliases.some((alias) => normalized.includes(alias)));
    return match?.message ?? paymentType;
}

// Payment display: shows a payment-specific instruction on line1, total on line2.
export function buildPaymentDisplay(paymentType: string, total: number, currency: Currency): CustomerDisplayPayload {
    const totalStr = formatAmount(total, currency);
    return {
        line1: padLine(getPaymentMessage(paymentType)),
        line2: formatLine('TOTAL', totalStr),
    };
}

// The change owed must stay on the screen until the next transaction starts, otherwise it is
// wiped as soon as the cashier acknowledges the change popup.
let changeDisplayHeld = false;

export function holdChangeDisplay() {
    changeDisplayHeld = true;
}

export function releaseChangeDisplay() {
    changeDisplayHeld = false;
}

export function isChangeDisplayHeld(): boolean {
    return changeDisplayHeld;
}
