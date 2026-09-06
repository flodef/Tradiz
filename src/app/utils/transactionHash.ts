import { createHash } from 'crypto';
import { PaymentLeg } from './interfaces';

export interface TransactionItemHashInput {
    label: string;
    quantity: number;
    amount: number | string;
    total: number | string;
    vat_rate?: number | string;
    discount_amount?: number | string | null;
}

export interface TransactionHashInput {
    order_id: string;
    user_name: string;
    payment_method: string;
    amount: number | string;
    currency: string;
    created_at: string;
    change?: string | null;
    device_id?: string | null;
    items?: TransactionItemHashInput[];
    payments?: PaymentLeg[];
}

/**
 * Canonical serialization of transaction line items for hashing.
 *
 * Items are sorted by label then quantity to ensure deterministic ordering
 * regardless of insertion order. Each item is serialized as a pipe-delimited
 * string of its fiscal fields: label, quantity, unit price, total, VAT rate,
 * discount amount.
 */
function canonicalItemsDigest(items?: TransactionItemHashInput[]): string {
    if (!items || items.length === 0) return '';

    const normalized = items.map((item) => ({
        label: String(item.label || ''),
        quantity: String(Number(item.quantity) || 0),
        amount: String(Number(item.amount) || 0),
        total: String(Number(item.total) || 0),
        vat_rate: String(Number(item.vat_rate) || 0),
        discount_amount: String(Number(item.discount_amount) || 0),
    }));

    // Sort by label then quantity for deterministic ordering
    normalized.sort((a, b) => {
        if (a.label !== b.label) return a.label < b.label ? -1 : 1;
        return a.quantity < b.quantity ? -1 : a.quantity > b.quantity ? 1 : 0;
    });

    return normalized
        .map((item) =>
            [item.label, item.quantity, item.amount, item.total, item.vat_rate, item.discount_amount].join(',')
        )
        .join(';');
}

export function computeTransactionHash(
    tx: TransactionHashInput,
    transactionId?: string | number,
    previousHash?: string | null
): string {
    const data = [
        previousHash || '',
        transactionId || 'new',
        tx.order_id,
        tx.user_name,
        tx.payment_method,
        String(Number(tx.amount)),
        tx.currency,
        String(tx.created_at),
        tx.change || '',
        tx.device_id || '',
        canonicalItemsDigest(tx.items),
    ].join('|');

    // Conditional: only append payments segment when legs exist.
    // Legacy rows (no payments) keep their exact digest.
    const payload = tx.payments?.length
        ? `${data}|${tx.payments.map((l) => `${l.method}:${l.amount}`).join(',')}`
        : data;

    return createHash('sha256').update(payload).digest('hex');
}
