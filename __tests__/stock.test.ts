import { computeSoldQuantities, computeCartQuantities, deriveEffectiveStock, stockKey } from '@/app/utils/stock';
import { Transaction, EmptyDiscount } from '@/app/utils/interfaces';
import {
    PROCESSING_KEYWORD,
    WAITING_KEYWORD,
    REFUND_KEYWORD,
    DELETED_KEYWORD,
    CANCELLED_KEYWORD,
    EXPUNGED_KEYWORD,
} from '@/app/utils/constants';
import { describe, it, expect } from 'vitest';

function makeTx(
    method: string,
    products: { category: string; label: string; quantity: number }[],
    deviceId?: string
): Transaction {
    return {
        validator: 'test',
        method,
        amount: 0,
        createdDate: Date.now(),
        modifiedDate: Date.now(),
        currency: 'EUR',
        products: products.map((p) => ({
            category: p.category,
            label: p.label,
            quantity: p.quantity,
            amount: 0,
            discount: EmptyDiscount,
        })),
        ...(deviceId ? { deviceId } : {}),
    };
}

describe('computeSoldQuantities', () => {
    it('counts WAITING transactions as sold', () => {
        const txs = [makeTx(WAITING_KEYWORD, [{ category: 'Boissons', label: 'Café', quantity: 2 }])];
        const sold = computeSoldQuantities(txs);
        expect(sold.get(stockKey('Boissons', 'Café'))).toBe(2);
    });

    it('counts confirmed (paid) transactions as sold', () => {
        const txs = [makeTx('CB', [{ category: 'Boissons', label: 'Café', quantity: 3 }])];
        const sold = computeSoldQuantities(txs);
        expect(sold.get(stockKey('Boissons', 'Café'))).toBe(3);
    });

    it('counts PROCESSING from other devices as sold (tentatively held)', () => {
        const txs = [
            makeTx(PROCESSING_KEYWORD, [{ category: 'Boissons', label: 'Café', quantity: 1 }], 'other-device'),
        ];
        const sold = computeSoldQuantities(txs, 'my-device');
        expect(sold.get(stockKey('Boissons', 'Café'))).toBe(1);
    });

    it('skips this device PROCESSING transaction (counted via live cart)', () => {
        const txs = [makeTx(PROCESSING_KEYWORD, [{ category: 'Boissons', label: 'Café', quantity: 5 }], 'my-device')];
        const sold = computeSoldQuantities(txs, 'my-device');
        expect(sold.get(stockKey('Boissons', 'Café'))).toBeUndefined();
    });

    it('excludes DELETED transactions', () => {
        const txs = [makeTx(DELETED_KEYWORD, [{ category: 'Boissons', label: 'Café', quantity: 2 }])];
        const sold = computeSoldQuantities(txs);
        expect(sold.get(stockKey('Boissons', 'Café'))).toBeUndefined();
    });

    it('excludes CANCELLED transactions', () => {
        const txs = [makeTx(CANCELLED_KEYWORD, [{ category: 'Boissons', label: 'Café', quantity: 2 }])];
        const sold = computeSoldQuantities(txs);
        expect(sold.get(stockKey('Boissons', 'Café'))).toBeUndefined();
    });

    it('excludes EXPUNGED transactions', () => {
        const txs = [makeTx(EXPUNGED_KEYWORD, [{ category: 'Boissons', label: 'Café', quantity: 2 }])];
        const sold = computeSoldQuantities(txs);
        expect(sold.get(stockKey('Boissons', 'Café'))).toBeUndefined();
    });

    it('counts refunds negatively (restores stock)', () => {
        const txs = [
            makeTx('CB', [{ category: 'Boissons', label: 'Café', quantity: 3 }]),
            makeTx(REFUND_KEYWORD, [{ category: 'Boissons', label: 'Café', quantity: 1 }]),
        ];
        const sold = computeSoldQuantities(txs);
        expect(sold.get(stockKey('Boissons', 'Café'))).toBe(2);
    });

    it('aggregates across multiple transactions', () => {
        const txs = [
            makeTx('CB', [{ category: 'Boissons', label: 'Café', quantity: 2 }]),
            makeTx(WAITING_KEYWORD, [{ category: 'Boissons', label: 'Café', quantity: 1 }]),
            makeTx('Espèces', [{ category: 'Food', label: 'Croissant', quantity: 3 }]),
        ];
        const sold = computeSoldQuantities(txs);
        expect(sold.get(stockKey('Boissons', 'Café'))).toBe(3);
        expect(sold.get(stockKey('Food', 'Croissant'))).toBe(3);
    });

    it('is idempotent on replay (same transactions → same result)', () => {
        const txs = [
            makeTx('CB', [{ category: 'Boissons', label: 'Café', quantity: 2 }]),
            makeTx(WAITING_KEYWORD, [{ category: 'Boissons', label: 'Thé', quantity: 1 }]),
        ];
        const sold1 = computeSoldQuantities(txs);
        const sold2 = computeSoldQuantities(txs);
        expect(sold1).toEqual(sold2);
    });
});

describe('computeCartQuantities', () => {
    it('sums quantities per product key', () => {
        const cart = [
            { category: 'Boissons', label: 'Café', quantity: 2, amount: 0 },
            { category: 'Boissons', label: 'Café', quantity: 1, amount: 0 },
            { category: 'Food', label: 'Croissant', quantity: 3, amount: 0 },
        ];
        const cartQty = computeCartQuantities(cart);
        expect(cartQty.get(stockKey('Boissons', 'Café'))).toBe(3);
        expect(cartQty.get(stockKey('Food', 'Croissant'))).toBe(3);
    });

    it('handles empty cart', () => {
        const cartQty = computeCartQuantities([]);
        expect(cartQty.size).toBe(0);
    });
});

describe('deriveEffectiveStock', () => {
    it('returns null for unlimited stock (configStock === null)', () => {
        expect(deriveEffectiveStock(null, 5, 2)).toBeNull();
    });

    it('subtracts sold and cart from configured stock', () => {
        expect(deriveEffectiveStock(10, 3, 2)).toBe(5);
    });

    it('clamps to 0 when oversold', () => {
        expect(deriveEffectiveStock(5, 10, 2)).toBe(0);
    });

    it('returns configured stock when nothing sold or in cart', () => {
        expect(deriveEffectiveStock(10, 0, 0)).toBe(10);
    });

    it('handles zero configured stock as sold out', () => {
        expect(deriveEffectiveStock(0, 0, 0)).toBe(0);
    });

    it('handles negative configured stock as sold out', () => {
        expect(deriveEffectiveStock(-5, 0, 0)).toBe(0);
    });
});
