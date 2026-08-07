import { Currency, Product } from './interfaces';

export interface CustomerDisplayPayload {
    line1: string;
    line2: string;
}

const DISPLAY_WIDTH = 20;

function formatAmount(amount: number, currency: Currency): string {
    return amount.toCurrency(currency.decimals, currency.symbol).replace(/\s/g, '').replace(/€/g, 'EUR');
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

function centerLine(text: string): string {
    const trimmed = text.slice(0, DISPLAY_WIDTH).trim();
    const totalPadding = DISPLAY_WIDTH - trimmed.length;
    const leftPadding = Math.floor(totalPadding / 2);
    return ' '.repeat(leftPadding) + trimmed + ' '.repeat(totalPadding - leftPadding);
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

// Idle display: shop name in uppercase, centered across 2 lines.
// Priority: show the FULL name. Split at a word boundary only if both halves
// fit within 20 chars; otherwise hard-cut at 20 to avoid losing any letters.
export function buildIdleDisplay(shopName: string, isClosed: boolean): CustomerDisplayPayload {
    if (isClosed) {
        return { line1: padLine(''), line2: padLine('Fermé') };
    }
    const name = shopName
        .toUpperCase()
        .trim()
        .slice(0, DISPLAY_WIDTH * 2);
    if (name.length <= DISPLAY_WIDTH) {
        return { line1: padLine(''), line2: centerLine(name) };
    }
    // Try to find a word boundary split where both halves fit in 20 chars
    let bestSplit = -1;
    for (let i = name.lastIndexOf(' ', DISPLAY_WIDTH); i > 0; i = name.lastIndexOf(' ', i - 1)) {
        const left = name.slice(0, i).trim();
        const right = name.slice(i).trim();
        if (left.length <= DISPLAY_WIDTH && right.length <= DISPLAY_WIDTH) {
            bestSplit = i;
            break;
        }
    }
    if (bestSplit > 0) {
        return {
            line1: centerLine(name.slice(0, bestSplit).trim()),
            line2: centerLine(name.slice(bestSplit).trim()),
        };
    }
    // No word boundary works — hard cut at 20 to show the full name
    return {
        line1: centerLine(name.slice(0, DISPLAY_WIDTH)),
        line2: centerLine(name.slice(DISPLAY_WIDTH)),
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
