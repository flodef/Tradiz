import { computeSortOrders } from '@/app/api/sql/updateArticles/route';
import { describe, expect, it } from 'vitest';

describe('computeSortOrders (from updateArticles route)', () => {
    it('should compute sort orders based on category order and position', () => {
        const products = [
            { name: 'A1', category: 'CatA', stock: 0, currencies: ['10'] },
            { name: 'B1', category: 'CatB', stock: 0, currencies: ['20'] },
            { name: 'A2', category: 'CatA', stock: 0, currencies: ['15'] },
            { name: 'B2', category: 'CatB', stock: 0, currencies: ['25'] },
        ];

        const sortOrders = computeSortOrders(products);

        // CatA appears first, so its products get sort orders starting at 10001
        expect(sortOrders[0]).toBe(10001); // A1 - first in CatA
        expect(sortOrders[2]).toBe(10002); // A2 - second in CatA

        // CatB appears second, so its products get sort orders starting at 20001
        expect(sortOrders[1]).toBe(20001); // B1 - first in CatB
        expect(sortOrders[3]).toBe(20002); // B2 - second in CatB
    });

    it('should handle single category', () => {
        const products = [
            { name: 'P1', category: 'Only', stock: 0, currencies: ['10'] },
            { name: 'P2', category: 'Only', stock: 0, currencies: ['20'] },
            { name: 'P3', category: 'Only', stock: 0, currencies: ['30'] },
        ];

        const sortOrders = computeSortOrders(products);

        expect(sortOrders).toEqual([10001, 10002, 10003]);
    });

    it('should handle many products per category', () => {
        const products = Array.from({ length: 100 }, (_, i) => ({
            name: `P${i}`,
            category: 'Cat1',
            stock: 0,
            currencies: [`${i}`],
        }));

        const sortOrders = computeSortOrders(products);

        expect(sortOrders[0]).toBe(10001);
        expect(sortOrders[99]).toBe(10100);
    });
});
