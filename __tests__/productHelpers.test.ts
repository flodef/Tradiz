import { describe, expect, it } from 'vitest';
import { Product, EmptyDiscount } from '@/app/utils/interfaces';
import { computeProductsTotal, resolveSelectionAfterDelete } from '@/app/contexts/dataProvider/productHelpers';

const product = (label: string, amount = 1, total = 1): Product => ({
    category: 'Boissons',
    label,
    amount,
    quantity: 1,
    total,
    discount: EmptyDiscount,
});

describe('computeProductsTotal', () => {
    it('sums the line totals', () => {
        expect(computeProductsTotal([product('Café', 1, 2), product('Thé', 1, 3)])).toBe(5);
    });

    it('handles an empty basket', () => {
        expect(computeProductsTotal([])).toBe(0);
    });

    it('treats a missing total as zero', () => {
        expect(computeProductsTotal([{ ...product('Café'), total: undefined as unknown as number }])).toBe(0);
    });
});

describe('resolveSelectionAfterDelete', () => {
    it('selects the previous product when the selected one is deleted', () => {
        const remaining = [product('Café', 2, 2), product('Thé', 3, 3)];

        const result = resolveSelectionAfterDelete(remaining, 2, true);

        expect(result?.selectedProduct?.label).toBe('Thé');
        expect(result?.amount).toBe(3);
        expect(result?.quantity).toBe(-1);
    });

    it('selects the first product when the selected one was at index 0', () => {
        const remaining = [product('Thé', 3, 3)];

        const result = resolveSelectionAfterDelete(remaining, 0, true);

        expect(result?.selectedProduct?.label).toBe('Thé');
    });

    it('returns null when the basket is empty after deletion', () => {
        expect(resolveSelectionAfterDelete([], 0, true)).toBeNull();
    });

    it('returns null when the deleted product was not the selected one', () => {
        const remaining = [product('Café', 2, 2), product('Thé', 3, 3)];

        expect(resolveSelectionAfterDelete(remaining, 1, false)).toBeNull();
    });

    it('sets quantity to 0 when the new selection has no amount', () => {
        const remaining = [product('Café', 0, 0)];

        const result = resolveSelectionAfterDelete(remaining, 1, true);

        expect(result?.quantity).toBe(0);
        expect(result?.amount).toBe(0);
    });
});
