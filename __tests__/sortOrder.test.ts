import { describe, it, expect } from 'vitest';

// Inline the function under test (it's not exported from the route)
function computeSortOrders(products: { category: string }[]): number[] {
    const categoryOrder: string[] = [];
    for (const p of products) {
        if (!categoryOrder.includes(p.category)) categoryOrder.push(p.category);
    }
    const positionInCat: Record<string, number> = {};
    return products.map((p) => {
        const catIdx = categoryOrder.indexOf(p.category);
        const pos = positionInCat[p.category] ?? 0;
        positionInCat[p.category] = pos + 1;
        return (catIdx + 1) * 10000 + (pos + 1);
    });
}

describe('computeSortOrders', () => {
    it('assigns encoded sort_order per category and position', () => {
        const products = [
            { category: 'Boissons' },
            { category: 'Boissons' },
            { category: 'Plats' },
        ];
        expect(computeSortOrders(products)).toEqual([10001, 10002, 20001]);
    });

    it('handles a single category', () => {
        const products = [{ category: 'A' }, { category: 'A' }, { category: 'A' }];
        expect(computeSortOrders(products)).toEqual([10001, 10002, 10003]);
    });

    it('preserves category order from first appearance', () => {
        const products = [
            { category: 'C' },
            { category: 'A' },
            { category: 'B' },
            { category: 'A' },
        ];
        expect(computeSortOrders(products)).toEqual([10001, 20001, 30001, 20002]);
    });

    it('handles empty array', () => {
        expect(computeSortOrders([])).toEqual([]);
    });

    it('handles "Sans catégorie" (empty string category)', () => {
        const products = [{ category: '' }, { category: '' }, { category: 'Plats' }];
        expect(computeSortOrders(products)).toEqual([10001, 10002, 20001]);
    });

    it('supports up to 9999 products per category without collision', () => {
        const products = Array.from({ length: 9999 }, () => ({ category: 'X' }));
        const orders = computeSortOrders(products);
        expect(orders[0]).toBe(10001);
        expect(orders[9998]).toBe(19999);
        // All unique
        expect(new Set(orders).size).toBe(9999);
    });
});
