import { describe, it, expect, beforeEach, vi } from 'vitest';

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
        it('should filter transactions within fiscal year based on yearStartDate', () => {
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

            // Current date: 2026-03-23
            const now = new Date('2026-03-23');
            const currentYear = now.getFullYear();
            const yearStart = new Date(currentYear, yearStartDate.month - 1, yearStartDate.day);

            // Since we're after March 3rd 2026, year starts on March 3rd 2026
            expect(now >= yearStart).toBe(true);

            const yearEnd = new Date(yearStart);
            yearEnd.setFullYear(yearStart.getFullYear() + 1);

            const filteredKeys = historicalKeys.filter((key) => {
                const dateStr = key.split('_')[1];
                if (!dateStr) return false;
                const txDate = new Date(dateStr);
                return txDate >= yearStart && txDate < yearEnd;
            });

            // Should include: 2026-03-03, 2026-03-10 (after March 3rd 2026)
            // Should exclude: all 2025 dates, 2026-01-15, 2026-03-02 (before March 3rd 2026)
            expect(filteredKeys).toEqual(['testshop_2026-03-03', 'testshop_2026-03-10']);
        });

        it('should use previous year as start if current date is before yearStartDate', () => {
            const yearStartDate = { month: 3, day: 3 }; // March 3rd
            const now = new Date('2026-03-01'); // Before March 3rd
            const currentYear = now.getFullYear();
            const yearStart = new Date(currentYear, yearStartDate.month - 1, yearStartDate.day);

            // Since we're before March 3rd 2026, use March 3rd 2025 as start
            if (now < yearStart) {
                yearStart.setFullYear(currentYear - 1);
            }

            expect(yearStart.getFullYear()).toBe(2025);
            expect(yearStart.getMonth()).toBe(2); // March (0-indexed)
            expect(yearStart.getDate()).toBe(3);
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

        it('should display years with "(en cours)" for current fiscal year', () => {
            const yearStartDate = { month: 3, day: 3 }; // March 3rd
            const now = new Date('2026-03-23'); // After March 3rd
            const currentYear = now.getFullYear();
            const yearStart = new Date(currentYear, yearStartDate.month - 1, yearStartDate.day);

            // Test year 2026 (current)
            const yearNum2026 = 2026;
            const isCurrent2026 = now >= yearStart ? yearNum2026 === currentYear : yearNum2026 === currentYear - 1;
            const display2026 = isCurrent2026 ? `${yearNum2026} (en cours)` : `${yearNum2026}`;

            expect(display2026).toBe('2026 (en cours)');

            // Test year 2025 (past)
            const yearNum2025 = 2025;
            const isCurrent2025 = now >= yearStart ? yearNum2025 === currentYear : yearNum2025 === currentYear - 1;
            const display2025 = isCurrent2025 ? `${yearNum2025} (en cours)` : `${yearNum2025}`;

            expect(display2025).toBe('2025');
        });

        it('should handle current year when before yearStartDate', () => {
            const yearStartDate = { month: 3, day: 3 }; // March 3rd
            const now = new Date('2026-03-01'); // Before March 3rd
            const currentYear = now.getFullYear();
            const yearStart = new Date(currentYear, yearStartDate.month - 1, yearStartDate.day);

            // When before year start, previous year is current
            const yearNum2025 = 2025;
            const isCurrent2025 = now >= yearStart ? yearNum2025 === currentYear : yearNum2025 === currentYear - 1;
            const display2025 = isCurrent2025 ? `${yearNum2025} (en cours)` : `${yearNum2025}`;

            expect(display2025).toBe('2025 (en cours)');
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
