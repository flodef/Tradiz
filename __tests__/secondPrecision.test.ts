import { describe, it, expect } from 'vitest';
import { floorToSeconds } from '@/app/contexts/DataProvider';

describe('secondPrecision floor logic', () => {
    it('floors millisecond timestamps to second precision', () => {
        expect(floorToSeconds(1778864850963)).toBe(1778864850000);
        expect(floorToSeconds(1778864851234)).toBe(1778864851000);
        expect(floorToSeconds(1778864851999)).toBe(1778864851000);
    });

    it('handles timestamps already at second precision', () => {
        expect(floorToSeconds(1778864850000)).toBe(1778864850000);
        expect(floorToSeconds(1778864851000)).toBe(1778864851000);
    });

    it('handles zero timestamp', () => {
        expect(floorToSeconds(0)).toBe(0);
    });

    it('handles negative timestamps', () => {
        expect(floorToSeconds(-1778864850963)).toBe(-1778864851000);
    });

    it('handles edge case of exactly 1000ms', () => {
        expect(floorToSeconds(1000)).toBe(1000);
        expect(floorToSeconds(1999)).toBe(1000);
    });
});

describe('second-precision comparison logic', () => {
    it('matches timestamps that differ only in milliseconds', () => {
        const localTs = 1778864850963;
        const sqlTs = floorToSeconds(localTs);
        expect(sqlTs).toBe(1778864850000);
        expect(sqlTs).not.toBe(localTs);
    });

    it('does not match timestamps that differ by more than 999ms', () => {
        const ts1 = 1778864850000;
        const ts2 = 1778864852000;
        expect(floorToSeconds(ts1)).not.toBe(floorToSeconds(ts2));
    });

    it('matches timestamps within same second', () => {
        const ts1 = 1778864850500;
        const ts2 = 1778864850999;
        expect(floorToSeconds(ts1)).toBe(floorToSeconds(ts2));
    });
});
