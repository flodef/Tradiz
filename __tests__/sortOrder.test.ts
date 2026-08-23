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

    // --- Regression: auto-assigned positions must use grid slot encoding ---

    it('auto-assigned positions use grid slot encoding (row*100+col), never col >= 6', () => {
        // 8 auto-assigned products + 1 with gridPosition in a single category (catalog mode).
        // With the old raw counter, auto positions would be 0..7, where 6 and 7
        // have col >= 6 which the frontend cannot decode.
        // With grid slot encoding: 0, 1, 2, 3, 4, 5, 100, 101 (skipping the taken gridPosition slot)
        const products = [
            { category: 'A', name: 'G', stock: 0, currencies: [], gridPosition: 2 },
            ...Array.from({ length: 8 }, (_, i) => ({
                category: 'A',
                name: `P${i}`,
                stock: 0,
                currencies: [],
            })),
        ];
        const orders = computeSortOrders(products);
        // Extract positionWithinCategory = sort_order - 10000
        const positions = orders.map((o) => o - 10000);
        // Every position must have col = pos % 100 < 6
        for (const pos of positions) {
            expect(pos % 100).toBeLessThan(6);
        }
        // G takes slot 2, auto fills 0, 1, 3, 4, 5, 100, 101, 102
        expect(positions).toEqual([2, 0, 1, 3, 4, 5, 100, 101, 102]);
    });

    it('auto-assigned positions fill grid row by row without collisions', () => {
        // 13 auto-assigned products + 1 with gridPosition in same category (catalog mode).
        // Should fill 2 full rows (12 slots) + 1 in row 3, skipping the taken gridPosition slot.
        const products = [
            { category: 'Cat', name: 'G', stock: 0, currencies: [], gridPosition: 0 },
            ...Array.from({ length: 13 }, (_, i) => ({
                category: 'Cat',
                name: `P${i}`,
                stock: 0,
                currencies: [],
            })),
        ];
        const orders = computeSortOrders(products);
        const positions = orders.map((o) => o - 10000);
        // All unique
        expect(new Set(positions).size).toBe(14);
        // Every position has col < 6
        for (const pos of positions) {
            expect(pos % 100).toBeLessThan(6);
        }
        // G takes slot 0, auto fills 1-5, 100-105, 200
        expect(positions[0]).toBe(0); // G
        expect(positions[1]).toBe(1);
        expect(positions[5]).toBe(5);
        expect(positions[6]).toBe(100);
        expect(positions[11]).toBe(105);
        expect(positions[12]).toBe(200);
        expect(positions[13]).toBe(201);
    });

    it('mixed gridPosition and auto-assigned: auto slots skip taken positions', () => {
        // Product at gridPosition 0 (pos 0) and gridPosition 1 (pos 1)
        // Then 7 auto-assigned should get: 2, 3, 4, 5, 100, 101, 102
        const products = [
            { category: 'A', name: 'G1', stock: 0, currencies: [], gridPosition: 0 },
            { category: 'A', name: 'G2', stock: 0, currencies: [], gridPosition: 1 },
            ...Array.from({ length: 7 }, (_, i) => ({
                category: 'A',
                name: `A${i}`,
                stock: 0,
                currencies: [],
            })),
        ];
        const orders = computeSortOrders(products);
        const positions = orders.map((o) => o - 10000);
        // First two are grid-assigned
        expect(positions[0]).toBe(0);
        expect(positions[1]).toBe(1);
        // Auto-assigned skip 0 and 1, fill 2-5 then 100-102
        expect(positions.slice(2)).toEqual([2, 3, 4, 5, 100, 101, 102]);
    });
});
