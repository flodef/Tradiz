import { describe, it, expect } from 'vitest';

describe('Fiscal Year Logic', () => {
    describe('Year grouping with yearStartDate {month: 10, day: 1}', () => {
        const yearStartDate = { month: 10, day: 1 }; // October 1st

        it('should assign transaction from October 1st to fiscal year 2025', () => {
            const txDate = new Date(2025, 9, 1); // October 1, 2025 (month is 0-indexed)
            const year = 2025;
            const fiscalYearStart = new Date(year, yearStartDate.month - 1, yearStartDate.day);
            
            const belongsToFiscalYear = txDate >= fiscalYearStart ? year : year - 1;
            
            expect(belongsToFiscalYear).toBe(2025);
        });

        it('should assign transaction from September 30th to fiscal year 2024', () => {
            const txDate = new Date(2025, 8, 30); // September 30, 2025
            const year = 2025;
            const fiscalYearStart = new Date(year, yearStartDate.month - 1, yearStartDate.day);
            
            const belongsToFiscalYear = txDate >= fiscalYearStart ? year : year - 1;
            
            expect(belongsToFiscalYear).toBe(2024);
        });

        it('should assign transaction from January 1st to fiscal year 2024', () => {
            const txDate = new Date(2025, 0, 1); // January 1, 2025
            const year = 2025;
            const fiscalYearStart = new Date(year, yearStartDate.month - 1, yearStartDate.day);
            
            const belongsToFiscalYear = txDate >= fiscalYearStart ? year : year - 1;
            
            expect(belongsToFiscalYear).toBe(2024);
        });

        it('should assign transaction from December 31st to fiscal year 2025', () => {
            const txDate = new Date(2025, 11, 31); // December 31, 2025
            const year = 2025;
            const fiscalYearStart = new Date(year, yearStartDate.month - 1, yearStartDate.day);
            
            const belongsToFiscalYear = txDate >= fiscalYearStart ? year : year - 1;
            
            expect(belongsToFiscalYear).toBe(2025);
        });
    });

    describe('Fiscal year date range filtering with yearStartDate {month: 10, day: 1}', () => {
        const yearStartDate = { month: 10, day: 1 }; // October 1st

        it('should include transactions from October 1, 2025 to September 30, 2026 for fiscal year 2025', () => {
            const fiscalYear = 2025;
            const fiscalYearStart = new Date(fiscalYear, yearStartDate.month - 1, yearStartDate.day);
            const fiscalYearEnd = new Date(fiscalYear + 1, yearStartDate.month - 1, yearStartDate.day - 1);

            // Test start boundary
            const startDate = new Date(2025, 9, 1); // October 1, 2025
            expect(startDate >= fiscalYearStart && startDate <= fiscalYearEnd).toBe(true);

            // Test end boundary
            const endDate = new Date(2026, 8, 30); // September 30, 2026
            expect(endDate >= fiscalYearStart && endDate <= fiscalYearEnd).toBe(true);

            // Test middle of range
            const midDate = new Date(2026, 0, 15); // January 15, 2026
            expect(midDate >= fiscalYearStart && midDate <= fiscalYearEnd).toBe(true);
        });

        it('should exclude transactions from September 30, 2025 for fiscal year 2025', () => {
            const fiscalYear = 2025;
            const fiscalYearStart = new Date(fiscalYear, yearStartDate.month - 1, yearStartDate.day);
            const fiscalYearEnd = new Date(fiscalYear + 1, yearStartDate.month - 1, yearStartDate.day - 1);

            const txDate = new Date(2025, 8, 30); // September 30, 2025
            expect(txDate >= fiscalYearStart && txDate <= fiscalYearEnd).toBe(false);
        });

        it('should exclude transactions from October 1, 2026 for fiscal year 2025', () => {
            const fiscalYear = 2025;
            const fiscalYearStart = new Date(fiscalYear, yearStartDate.month - 1, yearStartDate.day);
            const fiscalYearEnd = new Date(fiscalYear + 1, yearStartDate.month - 1, yearStartDate.day - 1);

            const txDate = new Date(2026, 9, 1); // October 1, 2026
            expect(txDate >= fiscalYearStart && txDate <= fiscalYearEnd).toBe(false);
        });

        it('should verify fiscal year 2025 boundaries', () => {
            const fiscalYear = 2025;
            const fiscalYearStart = new Date(fiscalYear, yearStartDate.month - 1, yearStartDate.day);
            const fiscalYearEnd = new Date(fiscalYear + 1, yearStartDate.month - 1, yearStartDate.day - 1);

            expect(fiscalYearStart.getFullYear()).toBe(2025);
            expect(fiscalYearStart.getMonth()).toBe(9); // October (0-indexed)
            expect(fiscalYearStart.getDate()).toBe(1);

            expect(fiscalYearEnd.getFullYear()).toBe(2026);
            expect(fiscalYearEnd.getMonth()).toBe(8); // September (0-indexed)
            expect(fiscalYearEnd.getDate()).toBe(30);
        });
    });

    describe('Default fiscal year (January 1st)', () => {
        const yearStartDate = { month: 1, day: 1 }; // January 1st

        it('should match calendar year for January 1st start date', () => {
            const fiscalYear = 2025;
            const fiscalYearStart = new Date(fiscalYear, yearStartDate.month - 1, yearStartDate.day);
            const fiscalYearEnd = new Date(fiscalYear + 1, yearStartDate.month - 1, yearStartDate.day - 1);

            expect(fiscalYearStart.getFullYear()).toBe(2025);
            expect(fiscalYearStart.getMonth()).toBe(0); // January
            expect(fiscalYearStart.getDate()).toBe(1);

            expect(fiscalYearEnd.getFullYear()).toBe(2025);
            expect(fiscalYearEnd.getMonth()).toBe(11); // December
            expect(fiscalYearEnd.getDate()).toBe(31);
        });
    });

    describe('Transaction key filtering', () => {
        const yearStartDate = { month: 10, day: 1 };

        it('should correctly filter transaction keys for fiscal year 2025', () => {
            const fiscalYear = 2025;
            const fiscalYearStart = new Date(fiscalYear, yearStartDate.month - 1, yearStartDate.day);
            const fiscalYearEnd = new Date(fiscalYear + 1, yearStartDate.month - 1, yearStartDate.day - 1);

            const testKeys = [
                'shopId_2025-09-30', // Should be excluded (belongs to FY 2024)
                'shopId_2025-10-01', // Should be included (start of FY 2025)
                'shopId_2025-12-31', // Should be included
                'shopId_2026-01-01', // Should be included
                'shopId_2026-09-30', // Should be included (end of FY 2025)
                'shopId_2026-10-01', // Should be excluded (belongs to FY 2026)
            ];

            const filtered = testKeys.filter((key) => {
                const dateStr = key.split('_')[1];
                if (!dateStr) return false;
                const [year, month, day] = dateStr.split('-').map(Number);
                const txDate = new Date(year, month - 1, day);
                return txDate >= fiscalYearStart && txDate <= fiscalYearEnd;
            });

            expect(filtered).toEqual([
                'shopId_2025-10-01',
                'shopId_2025-12-31',
                'shopId_2026-01-01',
                'shopId_2026-09-30',
            ]);
        });
    });
});
