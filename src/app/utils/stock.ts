import { Transaction } from './interfaces';
import {
    isProcessingTransaction,
    isRefundTransaction,
    isRemovedTransaction,
} from '../contexts/dataProvider/transactionHelpers';

export type StockMap = Map<string, number>;

export function stockKey(category: string, label: string): string {
    return `${category}|${label}`;
}

/**
 * Compute sold quantities from the given transactions.
 *
 * Stock is consumed by:
 * - WAITING transactions (order sent to kitchen, stock committed)
 * - Confirmed/paid transactions
 * - PROCESSING transactions from OTHER devices (tentatively held in their cart)
 *
 * Stock is restored by:
 * - Refund transactions (counted negatively)
 *
 * Stock is NOT affected by:
 * - This device's PROCESSING transaction (counted via the live cart separately)
 * - DELETED/CANCELLED/EXPUNGED transactions (removed — never committed)
 *
 * `transactions` should already be filtered to the current business day
 * (createdDate >= lastResetTime), which DataProvider already does.
 */
export function computeSoldQuantities(transactions: Transaction[], currentDeviceId?: string): StockMap {
    const sold = new Map<string, number>();

    for (const tx of transactions) {
        // Skip removed transactions (deleted/cancelled/expunged)
        if (isRemovedTransaction(tx)) continue;

        // Skip this device's PROCESSING transaction (counted via live cart)
        if (isProcessingTransaction(tx) && tx.deviceId === currentDeviceId) continue;

        // Refunds restore stock; everything else consumes
        const sign = isRefundTransaction(tx) ? -1 : 1;

        for (const product of tx.products ?? []) {
            if (!product.label || !product.category) continue;
            const key = stockKey(product.category, product.label);
            sold.set(key, (sold.get(key) ?? 0) + sign * product.quantity);
        }
    }

    return sold;
}

/**
 * Compute cart quantities from the live cart (products.current on this device).
 * Returns a map of stockKey → total quantity in the cart.
 */
export function computeCartQuantities<Product extends { category: string; label: string; quantity: number }>(
    cart: Product[]
): StockMap {
    const cartQty = new Map<string, number>();
    for (const product of cart) {
        if (!product.label || !product.category) continue;
        const key = stockKey(product.category, product.label);
        cartQty.set(key, (cartQty.get(key) ?? 0) + product.quantity);
    }
    return cartQty;
}

/**
 * Derive the effective stock for a product.
 *
 * - configStock === null → unlimited (null)
 * - otherwise → max(0, configStock - soldQty - cartQty)
 *
 * Negative results are clamped to 0 so the UI shows "sold out" rather than
 * a negative number (which can happen if configStock was reduced after sales).
 */
export function deriveEffectiveStock(
    configStock: number | null,
    soldQty: number,
    cartQty: number
): number | null {
    if (configStock === null) return null; // unlimited
    return Math.max(0, configStock - soldQty - cartQty);
}
