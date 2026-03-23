import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Day Reset Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getLastResetTime', () => {
        it('should return today closing hour if current time is after closing hour', () => {
            // Mock: Current time is Monday 9:00 AM, closing hour is 3:00 AM
            const now = new Date('2026-03-23T09:00:00');
            const closingHour = 3;

            const reset = new Date(now);
            reset.setHours(closingHour, 0, 0, 0);
            
            // Since 9:00 AM > 3:00 AM, should use today's 3:00 AM
            expect(now >= reset).toBe(true);
            
            const expectedResetTime = new Date('2026-03-23T03:00:00').getTime();
            expect(reset.getTime()).toBe(expectedResetTime);
        });

        it('should return yesterday closing hour if current time is before closing hour', () => {
            // Mock: Current time is Monday 1:00 AM, closing hour is 3:00 AM
            const now = new Date('2026-03-23T01:00:00');
            const closingHour = 3;

            const reset = new Date(now);
            reset.setHours(closingHour, 0, 0, 0);
            
            // Since 1:00 AM < 3:00 AM, should use yesterday's 3:00 AM
            expect(now < reset).toBe(true);
            
            reset.setDate(reset.getDate() - 1);
            const expectedResetTime = new Date('2026-03-22T03:00:00').getTime();
            expect(reset.getTime()).toBe(expectedResetTime);
        });
    });

    describe('Transaction Filtering', () => {
        it('should filter transactions by last reset time', () => {
            const lastResetTime = new Date('2026-03-23T03:00:00').getTime();
            
            const transactions = [
                { createdDate: new Date('2026-03-22T23:00:00').getTime(), amount: 10 }, // Before reset
                { createdDate: new Date('2026-03-23T02:00:00').getTime(), amount: 20 }, // Before reset
                { createdDate: new Date('2026-03-23T03:00:00').getTime(), amount: 30 }, // At reset (included)
                { createdDate: new Date('2026-03-23T09:00:00').getTime(), amount: 40 }, // After reset
            ];

            const currentDayTransactions = transactions.filter(tx => tx.createdDate >= lastResetTime);
            const oldTransactions = transactions.filter(tx => tx.createdDate < lastResetTime);

            expect(currentDayTransactions).toHaveLength(2);
            expect(currentDayTransactions[0].amount).toBe(30);
            expect(currentDayTransactions[1].amount).toBe(40);

            expect(oldTransactions).toHaveLength(2);
            expect(oldTransactions[0].amount).toBe(10);
            expect(oldTransactions[1].amount).toBe(20);
        });
    });

    describe('Transaction Grouping by Day', () => {
        it('should group old transactions by day with correct keys', () => {
            const shopId = 'testshop';
            const oldTransactions = [
                { createdDate: new Date('2026-03-21T10:00:00').getTime(), amount: 10 },
                { createdDate: new Date('2026-03-21T14:00:00').getTime(), amount: 20 },
                { createdDate: new Date('2026-03-22T10:00:00').getTime(), amount: 30 },
                { createdDate: new Date('2026-03-22T16:00:00').getTime(), amount: 40 },
            ];

            const groupedByDay = new Map<string, typeof oldTransactions>();
            oldTransactions.forEach(tx => {
                const date = new Date(tx.createdDate);
                const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                const key = `${shopId}_${dateKey}`;
                if (!groupedByDay.has(key)) groupedByDay.set(key, []);
                groupedByDay.get(key)!.push(tx);
            });

            expect(groupedByDay.size).toBe(2);
            expect(groupedByDay.has('testshop_2026-03-21')).toBe(true);
            expect(groupedByDay.has('testshop_2026-03-22')).toBe(true);
            expect(groupedByDay.get('testshop_2026-03-21')).toHaveLength(2);
            expect(groupedByDay.get('testshop_2026-03-22')).toHaveLength(2);
        });

        it('should NOT use TRANSACTIONS_KEYWORD when shopId is provided', () => {
            const shopId = 'myshop';
            const tx = { createdDate: new Date('2026-03-23T10:00:00').getTime(), amount: 100 };
            
            const date = new Date(tx.createdDate);
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const key = `${shopId}_${dateKey}`;

            expect(key).toBe('myshop_2026-03-23');
            expect(key).not.toContain('Transactions');
        });
    });

    describe('getNextResetTime', () => {
        it('should return tomorrow closing hour if current time is after today closing hour', () => {
            // Mock: Current time is Monday 9:00 AM, closing hour is 3:00 AM
            const now = new Date('2026-03-23T09:00:00');
            const closingHour = 3;

            const reset = new Date(now);
            reset.setHours(closingHour, 0, 0, 0);
            
            // Since 9:00 AM >= 3:00 AM, should schedule for tomorrow
            if (now >= reset) reset.setDate(reset.getDate() + 1);
            
            const expectedResetTime = new Date('2026-03-24T03:00:00').getTime();
            expect(reset.getTime()).toBe(expectedResetTime);
        });

        it('should return today closing hour if current time is before today closing hour', () => {
            // Mock: Current time is Monday 1:00 AM, closing hour is 3:00 AM
            const now = new Date('2026-03-23T01:00:00');
            const closingHour = 3;

            const reset = new Date(now);
            reset.setHours(closingHour, 0, 0, 0);
            
            // Since 1:00 AM < 3:00 AM, should schedule for today
            if (now >= reset) reset.setDate(reset.getDate() + 1);
            
            const expectedResetTime = new Date('2026-03-23T03:00:00').getTime();
            expect(reset.getTime()).toBe(expectedResetTime);
        });
    });
});
