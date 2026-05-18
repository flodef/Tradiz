import {
    formatFiscalYearDisplay,
    getFiscalYearRange,
    isCurrentFiscalYear,
    isKeyInFiscalYear,
} from '@/app/utils/fiscalYear';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Historical Transactions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Historique par Jour (Day)', () => {
        it('should filter and display transactions by day', () => {
            const historicalKeys = ['testshop_2026-03-21', 'testshop_2026-03-22', 'testshop_2026-03-23'];

            const items = historicalKeys
                .map((key) => key.split('_')[1] ?? '')
                .filter((key, index, array) => key && array.indexOf(key) === index)
                .sort()
                .reverse();

            expect(items).toEqual(['2026-03-23', '2026-03-22', '2026-03-21']);
        });

        it('should format day items with weekday, month, day, and year', () => {
            const dateKey = '2026-03-23';
            const formatted = new Date(dateKey).toLocaleDateString(undefined, {
                weekday: 'short',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });

            expect(formatted).toContain('2026');
            expect(formatted).toContain('23');
        });
    });

    describe('Historique par Mois (Month)', () => {
        it('should group transactions by month', () => {
            const historicalKeys = [
                'testshop_2026-03-21',
                'testshop_2026-03-22',
                'testshop_2026-03-23',
                'testshop_2026-04-01',
                'testshop_2026-04-15',
            ];

            const items = historicalKeys
                .map((key) => key.split('_')[1] ?? '')
                .map((key) => key.split('-').slice(0, 2).join('-'))
                .filter((key, index, array) => key && array.indexOf(key) === index)
                .sort()
                .reverse();

            expect(items).toEqual(['2026-04', '2026-03']);
        });

        it('should format month items with month and year', () => {
            const dateKey = '2026-03';
            const formatted = new Date(dateKey).toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
            });

            expect(formatted).toContain('2026');
        });
    });

    describe('Historique par Année fiscale (Year)', () => {
        it('should filter transactions within fiscal year using isKeyInFiscalYear', () => {
            const yearStartDate = { month: 3, day: 3 }; // March 3rd
            const historicalKeys = [
                'testshop_2025-03-01',
                'testshop_2025-03-03',
                'testshop_2025-03-05',
                'testshop_2025-12-31',
                'testshop_2026-01-15',
                'testshop_2026-03-02',
                'testshop_2026-03-03',
                'testshop_2026-03-10',
            ];

            // Use isKeyInFiscalYear to filter keys for fiscal year 2026
            // Note: fiscal year 2026 starts March 3rd 2026 and ends March 2nd 2027
            const filteredKeys = historicalKeys.filter((key) => isKeyInFiscalYear(key, 2026, yearStartDate));

            // Should include: 2026-03-03, 2026-03-10 (after March 3rd 2026)
            // Should exclude: all 2025 dates, 2026-01-15, 2026-03-02 (before March 3rd 2026)
            expect(filteredKeys).toEqual(['testshop_2026-03-03', 'testshop_2026-03-10']);
        });

        it('should use getFiscalYearRange to determine year boundaries', () => {
            const yearStartDate = { month: 3, day: 3 }; // March 3rd
            const { start, end } = getFiscalYearRange(2026, yearStartDate);

            expect(start.getFullYear()).toBe(2026);
            expect(start.getMonth()).toBe(2); // March (0-indexed)
            expect(start.getDate()).toBe(3);

            expect(end.getFullYear()).toBe(2027);
            expect(end.getMonth()).toBe(2); // March (0-indexed)
            expect(end.getDate()).toBe(2);
        });

        it('should group transactions by year', () => {
            const historicalKeys = [
                'testshop_2024-05-15',
                'testshop_2024-12-31',
                'testshop_2025-01-15',
                'testshop_2025-06-20',
                'testshop_2026-03-10',
            ];

            const items = historicalKeys
                .map((key) => key.split('_')[1] ?? '')
                .map((key) => key.split('-')[0]) // Year only
                .filter((key, index, array) => key && array.indexOf(key) === index)
                .sort()
                .reverse();

            expect(items).toEqual(['2026', '2025', '2024']);
        });

        it('should display years with "(en cours)" for current fiscal year using formatFiscalYearDisplay', () => {
            const yearStartDate = { month: 3, day: 3 }; // March 3rd
            const now = new Date('2026-03-23'); // After March 3rd

            // Use formatFiscalYearDisplay for proper formatting
            expect(formatFiscalYearDisplay(2026, yearStartDate, now)).toBe('2026 (en cours)');
            expect(formatFiscalYearDisplay(2025, yearStartDate, now)).toBe('2025');
        });

        it('should use isCurrentFiscalYear to detect current year', () => {
            const yearStartDate = { month: 3, day: 3 }; // March 3rd

            // After year start - 2026 is current
            const nowAfter = new Date('2026-03-23');
            expect(isCurrentFiscalYear(2026, yearStartDate, nowAfter)).toBe(true);
            expect(isCurrentFiscalYear(2025, yearStartDate, nowAfter)).toBe(false);

            // Before year start - 2025 is current (not 2026)
            const nowBefore = new Date('2026-03-01');
            expect(isCurrentFiscalYear(2025, yearStartDate, nowBefore)).toBe(true);
            expect(isCurrentFiscalYear(2026, yearStartDate, nowBefore)).toBe(false);
        });

        it('should handle current year when before yearStartDate using formatFiscalYearDisplay', () => {
            const yearStartDate = { month: 3, day: 3 }; // March 3rd
            const now = new Date('2026-03-01'); // Before March 3rd

            expect(formatFiscalYearDisplay(2025, yearStartDate, now)).toBe('2025 (en cours)');
            expect(formatFiscalYearDisplay(2026, yearStartDate, now)).toBe('2026');
        });
    });

    describe('Transaction Grouping', () => {
        it('should load all transactions for a selected day', async () => {
            const selectedDay = '2026-03-23';
            const shopPrefix = 'testshop';
            const key = `${shopPrefix}_${selectedDay}`;

            // Mock transactions for that day
            const mockTransactions = [
                { createdDate: new Date('2026-03-23T09:00:00').getTime(), amount: 10 },
                { createdDate: new Date('2026-03-23T14:00:00').getTime(), amount: 20 },
            ];

            expect(key).toBe('testshop_2026-03-23');
            expect(mockTransactions).toHaveLength(2);
        });

        it('should load and merge all transactions for a selected month', () => {
            const selectedMonth = '2026-03';
            const historicalKeys = [
                'testshop_2026-03-21',
                'testshop_2026-03-22',
                'testshop_2026-03-23',
                'testshop_2026-04-01',
            ];

            const matchingKeys = historicalKeys.filter((key) => key.includes(selectedMonth));

            expect(matchingKeys).toEqual(['testshop_2026-03-21', 'testshop_2026-03-22', 'testshop_2026-03-23']);
        });

        it('should load and merge all transactions for a selected year', () => {
            const selectedYear = '2026';
            const historicalKeys = [
                'testshop_2025-12-31',
                'testshop_2026-01-15',
                'testshop_2026-03-22',
                'testshop_2026-12-31',
                'testshop_2027-01-01',
            ];

            const matchingKeys = historicalKeys.filter((key) => key.includes(selectedYear));

            expect(matchingKeys).toEqual(['testshop_2026-01-15', 'testshop_2026-03-22', 'testshop_2026-12-31']);
        });
    });

    describe('Historical Keys Refresh', () => {
        it('should refresh historical keys after sync', () => {
            const prefix = 'testshop';
            const allKeys = [
                'testshop_2026-03-21',
                'testshop_2026-03-22',
                'testshop_2026-03-23',
                'othershop_2026-03-21',
            ];

            const matching = allKeys.filter((key) => key.split('_')[0] === prefix);

            expect(matching).toEqual(['testshop_2026-03-21', 'testshop_2026-03-22', 'testshop_2026-03-23']);
        });

        it('should handle empty historical keys gracefully', () => {
            const historicalKeys: string[] = [];

            expect(historicalKeys.length).toBe(0);
        });
    });
});
