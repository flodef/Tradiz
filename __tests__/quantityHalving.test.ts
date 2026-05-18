import { MIN_QUANTITY, quantityHalving } from '@/app/components/NumPad';
import { describe, expect, it } from 'vitest';

/**
 * Non-regression tests for the quantity halving bug in NumPad.tsx.
 *
 * Bug: pressing ½ repeatedly on a fractional quantity kept halving below 0.125,
 * producing values like 0.0625, 0.03125, ... down to 0.001953125 (= (0.5)^9).
 *
 * Fix: clamp the result of ½ and ¼ to a minimum of 0.125 (= 1/8).
 */

describe('½ key quantity behaviour', () => {
    it('starts at 1 and produces 0.5', () => {
        expect(quantityHalving(1, '½')).toBe(0.5);
    });

    it('halves 0.5 to 0.25', () => {
        expect(quantityHalving(0.5, '½')).toBe(0.25);
    });

    it('halves 0.25 to 0.125', () => {
        expect(quantityHalving(0.25, '½')).toBe(0.125);
    });

    it('cannot go below 0.125 — clamped at minimum', () => {
        expect(quantityHalving(0.125, '½')).toBe(0.125);
    });

    it('pressing ½ nine times never reaches 0.001953125', () => {
        let q = 1;
        for (let i = 0; i < 9; i++) q = quantityHalving(q, '½');
        expect(q).toBeGreaterThanOrEqual(MIN_QUANTITY);
        expect(q).not.toBe(0.001953125);
    });

    it('result is always >= 0.125 regardless of how many times ½ is pressed', () => {
        let q = 1;
        for (let i = 0; i < 20; i++) {
            q = quantityHalving(q, '½');
            expect(q).toBeGreaterThanOrEqual(MIN_QUANTITY);
        }
    });

    it('resets back to 0.5 when quantity is >= 1 (whole number input)', () => {
        expect(quantityHalving(3, '½')).toBe(0.5);
        expect(quantityHalving(1, '½')).toBe(0.5);
    });
});

describe('¼ key quantity behaviour', () => {
    it('starts at 1 and produces 0.25', () => {
        expect(quantityHalving(1, '¼')).toBe(0.25);
    });

    it('quarters 0.5 to 0.125 (clamped at minimum)', () => {
        expect(quantityHalving(0.5, '¼')).toBe(0.125);
    });

    it('cannot go below 0.125 — clamped at minimum', () => {
        expect(quantityHalving(0.25, '¼')).toBe(0.125);
        expect(quantityHalving(0.125, '¼')).toBe(0.125);
    });

    it('result is always >= 0.125 regardless of how many times ¼ is pressed', () => {
        let q = 1;
        for (let i = 0; i < 20; i++) {
            q = quantityHalving(q, '¼');
            expect(q).toBeGreaterThanOrEqual(MIN_QUANTITY);
        }
    });

    it('resets back to 0.25 when quantity is >= 1 (whole number input)', () => {
        expect(quantityHalving(5, '¼')).toBe(0.25);
    });
});
