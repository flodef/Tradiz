import { computeSortOrders } from '@/app/api/sql/updateArticles/route';
import { describe, it, expect } from 'vitest';

describe('computeSortOrders', () => {
    it('assigns encoded sort_order per category and position (list mode)', () => {
        const products = [
            { category: 'Boissons', name: 'Test', stock: 0, currencies: [] },
            { category: 'Boissons', name: 'Test', stock: 0, currencies: [] },
            { category: 'Plats', name: 'Test', stock: 0, currencies: [] },
        ];
        expect(computeSortOrders(products)).toEqual([10000, 10001, 20000]);
    });

    it('handles a single category (list mode)', () => {
        const products = [
            { category: 'A', name: 'Test', stock: 0, currencies: [] },
            { category: 'A', name: 'Test', stock: 0, currencies: [] },
            { category: 'A', name: 'Test', stock: 0, currencies: [] },
        ];
        expect(computeSortOrders(products)).toEqual([10000, 10001, 10002]);
    });

    it('preserves category order from first appearance', () => {
        const products = [
            { category: 'C', name: 'Test', stock: 0, currencies: [] },
            { category: 'A', name: 'Test', stock: 0, currencies: [] },
            { category: 'B', name: 'Test', stock: 0, currencies: [] },
            { category: 'A', name: 'Test', stock: 0, currencies: [] },
        ];
        expect(computeSortOrders(products)).toEqual([10000, 20000, 30000, 20001]);
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
        expect(computeSortOrders(products)).toEqual([10000, 10001, 20000]);
    });

    it('supports up to 9999 products per category without collision', () => {
        const products = Array.from({ length: 9999 }, () => ({
            category: 'X',
            name: 'Test',
            stock: 0,
            currencies: [],
        }));
        const orders = computeSortOrders(products);
        expect(orders[0]).toBe(10000);
        expect(orders[9998]).toBe(19998);
        // All unique
        expect(new Set(orders).size).toBe(9999);
    });

    // --- Catalog mode (gridPosition present) ---

    it('encodes gridPosition as row*100+col (catalog mode)', () => {
        // gridPosition 0 = row 0, col 0 → pos 000
        // gridPosition 5 = row 0, col 5 → pos 005
        // gridPosition 6 = row 1, col 0 → pos 100
        // gridPosition 35 = row 5, col 5 → pos 505
        const products = [
            { category: 'A', name: 'P1', stock: 0, currencies: [], gridPosition: 0 },
            { category: 'A', name: 'P2', stock: 0, currencies: [], gridPosition: 5 },
            { category: 'A', name: 'P3', stock: 0, currencies: [], gridPosition: 6 },
            { category: 'A', name: 'P4', stock: 0, currencies: [], gridPosition: 35 },
        ];
        expect(computeSortOrders(products)).toEqual([10000, 10005, 10100, 10505]);
    });

    it('catalog example: 12th category, 4th row, 5th col → 120405', () => {
        // gridPosition for row 4, col 5 = 4 * 6 + 5 = 29
        // Need 12 categories before this one
        const products: {
            category: string;
            name: string;
            stock: number;
            currencies: string[];
            gridPosition?: number;
        }[] = [];
        for (let i = 0; i < 11; i++) {
            products.push({ category: `Cat${i}`, name: 'X', stock: 0, currencies: [] });
        }
        products.push({ category: 'Cat11', name: 'Target', stock: 0, currencies: [], gridPosition: 29 });
        const orders = computeSortOrders(products);
        expect(orders[11]).toBe(120405);
    });

    it('catalog example: 6th category, 3rd row, 2nd col → 60302', () => {
        // gridPosition for row 3, col 2 = 3 * 6 + 2 = 20
        const products: {
            category: string;
            name: string;
            stock: number;
            currencies: string[];
            gridPosition?: number;
        }[] = [];
        for (let i = 0; i < 5; i++) {
            products.push({ category: `Cat${i}`, name: 'X', stock: 0, currencies: [] });
        }
        products.push({ category: 'Cat5', name: 'Target', stock: 0, currencies: [], gridPosition: 20 });
        const orders = computeSortOrders(products);
        expect(orders[5]).toBe(60302);
    });

    it('list example: 12th category, 405th position → 120405', () => {
        // 0-based: position 405 = the 406th product in the category
        const products: { category: string; name: string; stock: number; currencies: string[] }[] = [];
        for (let i = 0; i < 11; i++) {
            products.push({ category: `Cat${i}`, name: 'X', stock: 0, currencies: [] });
        }
        for (let i = 0; i <= 405; i++) {
            products.push({ category: 'Cat11', name: `P${i}`, stock: 0, currencies: [] });
        }
        const orders = computeSortOrders(products);
        expect(orders[11 + 405]).toBe(120405);
    });

    it('mixes gridPosition and auto-assigned positions without collision', () => {
        const products = [
            { category: 'A', name: 'P1', stock: 0, currencies: [], gridPosition: 5 },
            { category: 'A', name: 'P2', stock: 0, currencies: [] },
            { category: 'A', name: 'P3', stock: 0, currencies: [] },
        ];
        // P1 → gridPosition 5 = row 0, col 5 → pos 005 → sort_order 10005
        // P2 → first auto position not taken: 0 → sort_order 10000
        // P3 → next auto position not taken: 1 → sort_order 10001
        expect(computeSortOrders(products)).toEqual([10005, 10000, 10001]);
    });

    it('handles duplicate gridPosition by falling back to auto', () => {
        const products = [
            { category: 'A', name: 'P1', stock: 0, currencies: [], gridPosition: 3 },
            { category: 'A', name: 'P2', stock: 0, currencies: [], gridPosition: 3 },
        ];
        // First product with gridPosition 3 = row 0, col 3 → pos 003 → sort_order 10003
        // Second falls back to auto (0) → sort_order 10000
        expect(computeSortOrders(products)).toEqual([10003, 10000]);
    });
});
