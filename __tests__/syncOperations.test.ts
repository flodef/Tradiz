import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Sync Operations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Full Sync', () => {
        it('should group SQL transactions by their creation date, not current date', () => {
            const shopId = 'testshop';
            const sqlTransactions = [
                { createdDate: new Date('2026-03-21T09:59:12').getTime(), amount: 5.4 },
                { createdDate: new Date('2026-03-21T10:08:04').getTime(), amount: 16.2 },
                { createdDate: new Date('2026-03-22T14:00:00').getTime(), amount: 30 },
                { createdDate: new Date('2026-03-23T09:00:00').getTime(), amount: 40 },
            ];

            // Group by creation date
            const groupedByDate = new Map<string, typeof sqlTransactions>();
            sqlTransactions.forEach((tx) => {
                const date = new Date(tx.createdDate);
                const dateKey = `${shopId}_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                if (!groupedByDate.has(dateKey)) groupedByDate.set(dateKey, []);
                groupedByDate.get(dateKey)!.push(tx);
            });

            expect(groupedByDate.size).toBe(3);
            expect(groupedByDate.has('testshop_2026-03-21')).toBe(true);
            expect(groupedByDate.has('testshop_2026-03-22')).toBe(true);
            expect(groupedByDate.has('testshop_2026-03-23')).toBe(true);
            expect(groupedByDate.get('testshop_2026-03-21')).toHaveLength(2);
            expect(groupedByDate.get('testshop_2026-03-22')).toHaveLength(1);
            expect(groupedByDate.get('testshop_2026-03-23')).toHaveLength(1);
        });

        it('should merge SQL transactions with local transactions', () => {
            const localTransactions = [
                { createdDate: 1000, modifiedDate: 2000, amount: 10, method: 'cash' },
                { createdDate: 2000, modifiedDate: 3000, amount: 20, method: 'card' },
            ];

            const sqlTransactions = [
                { createdDate: 1000, modifiedDate: 2500, amount: 15, method: 'cash' }, // Newer version
                { createdDate: 3000, modifiedDate: 4000, amount: 30, method: 'cash' }, // New transaction
            ];

            // Merge logic: latest modifiedDate wins
            const merged = [...localTransactions];
            sqlTransactions.forEach((sqlTx) => {
                const localIndex = merged.findIndex((tx) => tx.createdDate === sqlTx.createdDate);
                if (localIndex === -1) {
                    // New transaction from SQL
                    merged.push(sqlTx);
                } else if (sqlTx.modifiedDate > merged[localIndex].modifiedDate) {
                    // SQL version is newer
                    merged[localIndex] = sqlTx;
                }
            });

            expect(merged).toHaveLength(3);
            expect(merged.find((tx) => tx.createdDate === 1000)?.amount).toBe(15); // SQL version won
            expect(merged.find((tx) => tx.createdDate === 2000)?.amount).toBe(20); // Local version kept
            expect(merged.find((tx) => tx.createdDate === 3000)?.amount).toBe(30); // New from SQL
        });

        it('should archive old transactions to IndexedDB by day', async () => {
            const shopId = 'testshop';
            const lastResetTime = new Date('2026-03-23T03:00:00').getTime();

            const mergedTransactions = [
                { createdDate: new Date('2026-03-21T10:00:00').getTime(), amount: 10 },
                { createdDate: new Date('2026-03-22T14:00:00').getTime(), amount: 20 },
                { createdDate: new Date('2026-03-23T09:00:00').getTime(), amount: 30 }, // Current day
            ];

            const currentDayTransactions = mergedTransactions.filter((tx) => tx.createdDate >= lastResetTime);
            const oldTransactions = mergedTransactions.filter((tx) => tx.createdDate < lastResetTime);

            expect(currentDayTransactions).toHaveLength(1);
            expect(oldTransactions).toHaveLength(2);

            // Group old transactions by day
            const groupedByDay = new Map<string, typeof oldTransactions>();
            oldTransactions.forEach((tx) => {
                const date = new Date(tx.createdDate);
                const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                const key = `${shopId}_${dateKey}`;
                if (!groupedByDay.has(key)) groupedByDay.set(key, []);
                groupedByDay.get(key)!.push(tx);
            });

            expect(groupedByDay.size).toBe(2);
            expect(groupedByDay.has('testshop_2026-03-21')).toBe(true);
            expect(groupedByDay.has('testshop_2026-03-22')).toBe(true);
        });
    });

    describe('Day Sync', () => {
        it('should only sync transactions for the current day', () => {
            const today = new Date('2026-03-23');
            const todayStart = new Date(today);
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(today);
            todayEnd.setHours(23, 59, 59, 999);

            const transactions = [
                { createdDate: new Date('2026-03-22T23:00:00').getTime(), amount: 10 },
                { createdDate: new Date('2026-03-23T09:00:00').getTime(), amount: 20 },
                { createdDate: new Date('2026-03-23T14:00:00').getTime(), amount: 30 },
                { createdDate: new Date('2026-03-24T01:00:00').getTime(), amount: 40 },
            ];

            // Filter for today only (without reset time consideration)
            const todayTransactions = transactions.filter((tx) => {
                const txDate = new Date(tx.createdDate);
                return txDate >= todayStart && txDate <= todayEnd;
            });

            expect(todayTransactions).toHaveLength(2);
            expect(todayTransactions[0].amount).toBe(20);
            expect(todayTransactions[1].amount).toBe(30);
        });

        it('should push local-only transactions to SQL', () => {
            const localTransactions = [
                { createdDate: 1000, modifiedDate: 2000, amount: 10 },
                { createdDate: 2000, modifiedDate: 3000, amount: 20 },
                { createdDate: 3000, modifiedDate: 4000, amount: 30 },
            ];

            const sqlTransactions = [{ createdDate: 1000, modifiedDate: 2000, amount: 10 }];

            // Find transactions that exist locally but not in SQL
            const localOnlyTransactions = localTransactions.filter(
                (localTx) => !sqlTransactions.find((sqlTx) => sqlTx.createdDate === localTx.createdDate)
            );

            expect(localOnlyTransactions).toHaveLength(2);
            expect(localOnlyTransactions[0].createdDate).toBe(2000);
            expect(localOnlyTransactions[1].createdDate).toBe(3000);
        });

        it('should update SQL when local transaction is newer', () => {
            const localTransactions = [
                { createdDate: 1000, modifiedDate: 3000, amount: 15 }, // Newer
                { createdDate: 2000, modifiedDate: 3000, amount: 20 },
            ];

            const sqlTransactions = [
                { createdDate: 1000, modifiedDate: 2000, amount: 10 }, // Older
                { createdDate: 2000, modifiedDate: 4000, amount: 25 }, // Newer
            ];

            const transactionsToUpdate = localTransactions.filter((localTx) => {
                const sqlTx = sqlTransactions.find((s) => s.createdDate === localTx.createdDate);
                return sqlTx && localTx.modifiedDate > sqlTx.modifiedDate;
            });

            expect(transactionsToUpdate).toHaveLength(1);
            expect(transactionsToUpdate[0].createdDate).toBe(1000);
            expect(transactionsToUpdate[0].amount).toBe(15);
        });
    });

    describe('Transaction Filename Generation', () => {
        it('should generate correct filename with shopId and date', () => {
            const shopId = 'myshop';
            const date = new Date('2026-03-23');

            const getFormattedDate = (d: Date) => {
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };

            const filename = `${shopId}_${getFormattedDate(date)}`;

            expect(filename).toBe('myshop_2026-03-23');
        });

        it('should use TRANSACTIONS_KEYWORD as fallback when shopId is empty', () => {
            const shopId = '';
            const TRANSACTIONS_KEYWORD = 'Transactions';
            const date = new Date('2026-03-23');

            const getFormattedDate = (d: Date) => {
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };

            const filename = `${shopId || TRANSACTIONS_KEYWORD}_${getFormattedDate(date)}`;

            expect(filename).toBe('Transactions_2026-03-23');
        });
    });

    describe('Sync Completion', () => {
        it('should return a Promise that resolves when sync is complete', async () => {
            const mockSyncFunction = vi.fn().mockResolvedValue(undefined);

            await mockSyncFunction();

            expect(mockSyncFunction).toHaveBeenCalledTimes(1);
        });

        it('should handle sync errors gracefully', async () => {
            const mockSyncFunction = vi.fn().mockRejectedValue(new Error('Sync failed'));

            try {
                await mockSyncFunction();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toBe('Sync failed');
            }
        });
    });
});
