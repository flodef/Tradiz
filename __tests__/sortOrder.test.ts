import { computeSortOrders } from '@/app/api/sql/updateArticles/route';
import { describe, it, expect } from 'vitest';

describe('computeSortOrders', () => {
    it('assigns encoded sort_order per category and position', () => {
        const products = [
            { category: 'Boissons', name: 'Test', stock: 0, currencies: [] },
            { category: 'Boissons', name: 'Test', stock: 0, currencies: [] },
            { category: 'Plats', name: 'Test', stock: 0, currencies: [] },
        ];
        expect(computeSortOrders(products)).toEqual([10001, 10002, 20001]);
    });

    it('handles a single category', () => {
        const products = [
            { category: 'A', name: 'Test', stock: 0, currencies: [] },
            { category: 'A', name: 'Test', stock: 0, currencies: [] },
            { category: 'A', name: 'Test', stock: 0, currencies: [] },
        ];
        expect(computeSortOrders(products)).toEqual([10001, 10002, 10003]);
    });

    it('preserves category order from first appearance', () => {
        const products = [
            { category: 'C', name: 'Test', stock: 0, currencies: [] },
            { category: 'A', name: 'Test', stock: 0, currencies: [] },
            { category: 'B', name: 'Test', stock: 0, currencies: [] },
            { category: 'A', name: 'Test', stock: 0, currencies: [] },
        ];
        expect(computeSortOrders(products)).toEqual([10001, 20001, 30001, 20002]);
    });

    it('handles empty array', () => {
        expect(computeSortOrders([])).toEqual([]);
    });

    it('handles "Sans catégorie" (empty string category)', () => {
        const products = [
            { category: '', name: 'Test', stock: 0, currencies: [] },
            { category: '', name: 'Test', stock: 0, currencies: [] },
            { category: 'Plats', name: 'Test', stock: 0, currencies: [] },
        ];
        expect(computeSortOrders(products)).toEqual([10001, 10002, 20001]);
    });

    it('supports up to 9999 products per category without collision', () => {
        const products = Array.from({ length: 9999 }, () => ({
            category: 'X',
            name: 'Test',
            stock: 0,
            currencies: [],
        }));
        const orders = computeSortOrders(products);
        expect(orders[0]).toBe(10001);
        expect(orders[9998]).toBe(19999);
        // All unique
        expect(new Set(orders).size).toBe(9999);
    });
});
