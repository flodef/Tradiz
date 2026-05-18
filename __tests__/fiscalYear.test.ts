import {
    formatFiscalYearDisplay,
    getFiscalYearForDate,
    getFiscalYearRange,
    isCurrentFiscalYear,
    isKeyInFiscalYear,
    parseTransactionKeyDate,
} from '@/app/utils/fiscalYear';
import { describe, expect, it } from 'vitest';

describe('Fiscal Year Logic', () => {
    describe('Year grouping with yearStartDate {month: 10, day: 1}', () => {
        const yearStartDate = { month: 10, day: 1 }; // October 1st

        it('should assign transaction from October 1st to fiscal year 2025', () => {
            const txDate = new Date(2025, 9, 1); // October 1, 2025 (month is 0-indexed)
            expect(getFiscalYearForDate(txDate, yearStartDate)).toBe(2025);
        });

        it('should assign transaction from September 30th to fiscal year 2024', () => {
            const txDate = new Date(2025, 8, 30); // September 30, 2025
            expect(getFiscalYearForDate(txDate, yearStartDate)).toBe(2024);
        });

        it('should assign transaction from January 1st to fiscal year 2024', () => {
            const txDate = new Date(2025, 0, 1); // January 1, 2025
            expect(getFiscalYearForDate(txDate, yearStartDate)).toBe(2024);
        });

        it('should assign transaction from December 31st to fiscal year 2025', () => {
            const txDate = new Date(2025, 11, 31); // December 31, 2025
            expect(getFiscalYearForDate(txDate, yearStartDate)).toBe(2025);
        });
    });

    describe('Fiscal year date range filtering with yearStartDate {month: 10, day: 1}', () => {
        const yearStartDate = { month: 10, day: 1 }; // October 1st

        it('should include transactions from October 1, 2025 to September 30, 2026 for fiscal year 2025', () => {
            const { start, end } = getFiscalYearRange(2025, yearStartDate);

            // Test start boundary
            const startDate = new Date(2025, 9, 1); // October 1, 2025
            expect(startDate >= start && startDate <= end).toBe(true);

            // Test end boundary
            const endDate = new Date(2026, 8, 30); // September 30, 2026
            expect(endDate >= start && endDate <= end).toBe(true);

            // Test middle of range
            const midDate = new Date(2026, 0, 15); // January 15, 2026
            expect(midDate >= start && midDate <= end).toBe(true);
        });

        it('should exclude transactions from September 30, 2025 for fiscal year 2025', () => {
            const { start, end } = getFiscalYearRange(2025, yearStartDate);
            const txDate = new Date(2025, 8, 30); // September 30, 2025
            expect(txDate >= start && txDate <= end).toBe(false);
        });

        it('should exclude transactions from October 1, 2026 for fiscal year 2025', () => {
            const { start, end } = getFiscalYearRange(2025, yearStartDate);
            const txDate = new Date(2026, 9, 1); // October 1, 2026
            expect(txDate >= start && txDate <= end).toBe(false);
        });

        it('should verify fiscal year 2025 boundaries', () => {
            const { start, end } = getFiscalYearRange(2025, yearStartDate);

            expect(start.getFullYear()).toBe(2025);
            expect(start.getMonth()).toBe(9); // October (0-indexed)
            expect(start.getDate()).toBe(1);

            expect(end.getFullYear()).toBe(2026);
            expect(end.getMonth()).toBe(8); // September (0-indexed)
            expect(end.getDate()).toBe(30);
        });
    });

    describe('Default fiscal year (January 1st)', () => {
        const yearStartDate = { month: 1, day: 1 }; // January 1st

        it('should match calendar year for January 1st start date', () => {
            const { start, end } = getFiscalYearRange(2025, yearStartDate);

            expect(start.getFullYear()).toBe(2025);
            expect(start.getMonth()).toBe(0); // January
            expect(start.getDate()).toBe(1);

            expect(end.getFullYear()).toBe(2025);
            expect(end.getMonth()).toBe(11); // December
            expect(end.getDate()).toBe(31);
        });

        it('should return same year for dates in calendar year', () => {
            expect(getFiscalYearForDate(new Date(2025, 0, 1), yearStartDate)).toBe(2025);
            expect(getFiscalYearForDate(new Date(2025, 5, 15), yearStartDate)).toBe(2025);
            expect(getFiscalYearForDate(new Date(2025, 11, 31), yearStartDate)).toBe(2025);
        });
    });

    describe('Transaction key filtering', () => {
        const yearStartDate = { month: 10, day: 1 };

        it('should correctly filter transaction keys for fiscal year 2025', () => {
            const testKeys = [
                'shopId_2025-09-30', // Should be excluded (belongs to FY 2024)
                'shopId_2025-10-01', // Should be included (start of FY 2025)
                'shopId_2025-12-31', // Should be included
                'shopId_2026-01-01', // Should be included
                'shopId_2026-09-30', // Should be included (end of FY 2025)
                'shopId_2026-10-01', // Should be excluded (belongs to FY 2026)
            ];

            const filtered = testKeys.filter((key) => isKeyInFiscalYear(key, 2025, yearStartDate));

            expect(filtered).toEqual([
                'shopId_2025-10-01',
                'shopId_2025-12-31',
                'shopId_2026-01-01',
                'shopId_2026-09-30',
            ]);
        });
    });

    describe('parseTransactionKeyDate', () => {
        it('should parse valid transaction key', () => {
            const date = parseTransactionKeyDate('shopId_2025-03-23');
            expect(date).not.toBeNull();
            expect(date!.getFullYear()).toBe(2025);
            expect(date!.getMonth()).toBe(2); // March (0-indexed)
            expect(date!.getDate()).toBe(23);
        });

        it('should return null for invalid key', () => {
            expect(parseTransactionKeyDate('invalid')).toBeNull();
            expect(parseTransactionKeyDate('shopId_invalid-date')).toBeNull();
        });
    });

    describe('isCurrentFiscalYear', () => {
        const yearStartDate = { month: 3, day: 3 }; // March 3rd

        it('should identify current fiscal year when after year start', () => {
            const now = new Date('2026-03-23'); // After March 3rd
            expect(isCurrentFiscalYear(2026, yearStartDate, now)).toBe(true);
            expect(isCurrentFiscalYear(2025, yearStartDate, now)).toBe(false);
        });

        it('should identify current fiscal year when before year start', () => {
            const now = new Date('2026-03-01'); // Before March 3rd
            expect(isCurrentFiscalYear(2025, yearStartDate, now)).toBe(true);
            expect(isCurrentFiscalYear(2026, yearStartDate, now)).toBe(false);
        });
    });

    describe('formatFiscalYearDisplay', () => {
        const yearStartDate = { month: 3, day: 3 }; // March 3rd

        it('should add "(en cours)" for current fiscal year when after year start', () => {
            const now = new Date('2026-03-23');
            expect(formatFiscalYearDisplay(2026, yearStartDate, now)).toBe('2026 (en cours)');
            expect(formatFiscalYearDisplay(2025, yearStartDate, now)).toBe('2025');
        });

        it('should add "(en cours)" for current fiscal year when before year start', () => {
            const now = new Date('2026-03-01');
            expect(formatFiscalYearDisplay(2025, yearStartDate, now)).toBe('2025 (en cours)');
            expect(formatFiscalYearDisplay(2026, yearStartDate, now)).toBe('2026');
        });
    });
});
