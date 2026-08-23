import { describe, it, expect } from 'vitest';
import {
    GRID_COLS,
    GRID_ROWS,
    MAX_PRODUCTS,
    CATEGORY_MULTIPLIER,
    encodeGridPosition,
    encodeSortOrder,
    decodeCategoryIndex,
    decodePosition,
    decodeGridPosition,
    decodeGridSlot,
} from '../src/app/utils/sortOrder';

describe('sortOrder module', () => {
    describe('constants', () => {
        it('GRID_COLS is 6', () => {
            expect(GRID_COLS).toBe(6);
        });
        it('GRID_ROWS is 6', () => {
            expect(GRID_ROWS).toBe(6);
        });
        it('MAX_PRODUCTS = GRID_COLS * GRID_ROWS = 36', () => {
            expect(MAX_PRODUCTS).toBe(36);
        });
        it('CATEGORY_MULTIPLIER is 10000', () => {
            expect(CATEGORY_MULTIPLIER).toBe(10000);
        });
    });

    describe('encodeGridPosition', () => {
        it('encodes gridPosition 0 → 0 (row 0, col 0)', () => {
            expect(encodeGridPosition(0)).toBe(0);
        });
        it('encodes gridPosition 5 → 5 (row 0, col 5)', () => {
            expect(encodeGridPosition(5)).toBe(5);
        });
        it('encodes gridPosition 6 → 100 (row 1, col 0)', () => {
            expect(encodeGridPosition(6)).toBe(100);
        });
        it('encodes gridPosition 35 → 505 (row 5, col 5)', () => {
            expect(encodeGridPosition(35)).toBe(505);
        });
        it('never produces col >= 6', () => {
            for (let i = 0; i < MAX_PRODUCTS; i++) {
                expect(encodeGridPosition(i) % 100).toBeLessThan(GRID_COLS);
            }
        });
    });

    describe('encodeSortOrder', () => {
        it('encodes category 0, position 0 → 10000', () => {
            expect(encodeSortOrder(0, 0)).toBe(10000);
        });
        it('encodes category 11, position 405 → 120405', () => {
            expect(encodeSortOrder(11, 405)).toBe(120405);
        });
        it('encodes category 5, position 302 → 60302', () => {
            expect(encodeSortOrder(5, 302)).toBe(60302);
        });
    });

    describe('decodeCategoryIndex', () => {
        it('decodes 10000 → 0', () => {
            expect(decodeCategoryIndex(10000)).toBe(0);
        });
        it('decodes 120405 → 11', () => {
            expect(decodeCategoryIndex(120405)).toBe(11);
        });
    });

    describe('decodePosition', () => {
        it('decodes 10000 → 0', () => {
            expect(decodePosition(10000)).toBe(0);
        });
        it('decodes 120405 → 405', () => {
            expect(decodePosition(120405)).toBe(405);
        });
    });

    describe('decodeGridPosition', () => {
        it('decodes sort_order 10000 → gridPosition 0', () => {
            expect(decodeGridPosition(10000)).toBe(0);
        });
        it('decodes sort_order 10100 → gridPosition 6', () => {
            expect(decodeGridPosition(10100)).toBe(6);
        });
        it('decodes sort_order 10505 → gridPosition 35', () => {
            expect(decodeGridPosition(10505)).toBe(35);
        });
        it('returns undefined for list-mode positions (col >= 6)', () => {
            expect(decodeGridPosition(10006)).toBeUndefined();
        });
        it('returns undefined for row >= 6', () => {
            expect(decodeGridPosition(10600)).toBeUndefined();
        });
        it('returns undefined for large sequential positions', () => {
            expect(decodeGridPosition(10999)).toBeUndefined();
        });
    });

    describe('decodeGridSlot', () => {
        it('decodes sort_order 10003 → slot 3', () => {
            expect(decodeGridSlot(10003)).toBe(3);
        });
        it('decodes sort_order 10205 → slot 17 (row 2, col 5)', () => {
            expect(decodeGridSlot(10205)).toBe(17);
        });
        it('returns undefined for out-of-range positions', () => {
            expect(decodeGridSlot(10999)).toBeUndefined();
        });
    });

    describe('round-trip: encode → decode', () => {
        it('encodeGridPosition → decodeGridPosition round-trips for all 36 slots', () => {
            for (let i = 0; i < MAX_PRODUCTS; i++) {
                const encoded = encodeGridPosition(i);
                const so = encodeSortOrder(0, encoded);
                expect(decodeGridPosition(so)).toBe(i);
            }
        });
        it('encodeSortOrder → decodeCategoryIndex + decodePosition round-trips', () => {
            for (let cat = 0; cat < 20; cat++) {
                for (let pos = 0; pos < 600; pos += 37) {
                    const so = encodeSortOrder(cat, pos);
                    expect(decodeCategoryIndex(so)).toBe(cat);
                    expect(decodePosition(so)).toBe(pos);
                }
            }
        });
    });
});
