import { floorToSeconds } from '@/app/contexts/DataProvider';
import { describe, expect, it } from 'vitest';

// Test the timestamp flooring used for createdDate to match SQL TIMESTAMP precision
// This ensures no duplicates occur due to ms vs second precision mismatch

describe('timestamp flooring for SQL compatibility', () => {
    it('removes milliseconds from timestamp', () => {
        expect(floorToSeconds(1715856645123)).toBe(1715856645000);
        expect(floorToSeconds(1715856645999)).toBe(1715856645000);
        expect(floorToSeconds(1715856645000)).toBe(1715856645000);
    });

    it('handles edge case of exactly 1000ms', () => {
        expect(floorToSeconds(1000)).toBe(1000);
    });

    it('handles zero timestamp', () => {
        expect(floorToSeconds(0)).toBe(0);
    });

    it('preserves second-precision timestamps', () => {
        expect(floorToSeconds(1715856645000)).toBe(1715856645000);
    });

    it('handles timestamps at second boundary', () => {
        expect(floorToSeconds(1715856644999)).toBe(1715856644000);
        expect(floorToSeconds(1715856645000)).toBe(1715856645000);
        expect(floorToSeconds(1715856645001)).toBe(1715856645000);
    });

    it('handles large timestamps', () => {
        const largeTs = 9999999999999;
        const floored = floorToSeconds(largeTs);
        expect(floored).toBeLessThan(largeTs);
        expect(floored % 1000).toBe(0);
    });
});

describe('timestamp comparison with second precision', () => {
    it('matches timestamps within same second', () => {
        const ts1 = 1715856645123;
        const ts2 = 1715856645789;
        expect(floorToSeconds(ts1)).toBe(floorToSeconds(ts2));
    });

    it('does not match timestamps in different seconds', () => {
        const ts1 = 1715856645123;
        const ts2 = 1715856646123;
        expect(floorToSeconds(ts1)).not.toBe(floorToSeconds(ts2));
    });

    it('handles duplicate detection', () => {
        const localTx = { createdDate: 1715856645123 };
        const sqlTx = { createdDate: 1715856645000 }; // SQL second precision
        expect(floorToSeconds(localTx.createdDate)).toBe(sqlTx.createdDate);
    });
});
