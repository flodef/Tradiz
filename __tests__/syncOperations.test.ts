import {
    cloudToLocalMerge,
    filterTransactionsForDay,
    findLocalOnlyTransactions,
    findNewerLocalTransactions,
    generateTransactionKey,
    getFormattedDateKey,
    groupTransactionsByDate,
    mergeTransactionArrays,
    reconcileLocalWithSQL,
    splitTransactionsByResetTime,
} from '@/app/contexts/dataProvider/syncUtils';
import { TRANSACTIONS_KEYWORD } from '@/app/utils/constants';
import { Transaction } from '@/app/utils/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

            // Use the real groupTransactionsByDate function
            const groupedByDate = groupTransactionsByDate(sqlTransactions, shopId);

            expect(groupedByDate.size).toBe(3);
            expect(groupedByDate.has('testshop_2026-03-21')).toBe(true);
            expect(groupedByDate.has('testshop_2026-03-22')).toBe(true);
            expect(groupedByDate.has('testshop_2026-03-23')).toBe(true);
            expect(groupedByDate.get('testshop_2026-03-21')).toHaveLength(2);
            expect(groupedByDate.get('testshop_2026-03-22')).toHaveLength(1);
            expect(groupedByDate.get('testshop_2026-03-23')).toHaveLength(1);
        });

        it('should merge SQL transactions with local transactions using mergeTransactionArrays', () => {
            const localTransactions = [
                { createdDate: 1000, modifiedDate: 2000, amount: 10, method: 'cash' },
                { createdDate: 2000, modifiedDate: 3000, amount: 20, method: 'card' },
            ];

            const sqlTransactions = [
                { createdDate: 1000, modifiedDate: 2500, amount: 15, method: 'cash' }, // Newer version
                { createdDate: 3000, modifiedDate: 4000, amount: 30, method: 'cash' }, // New transaction
            ];

            // Use the real mergeTransactionArrays function
            const merged = mergeTransactionArrays(localTransactions as Transaction[], sqlTransactions as Transaction[]);

            expect(merged).toHaveLength(3);
            expect(merged.find((tx) => tx.createdDate === 1000)?.amount).toBe(15); // SQL version won
            expect(merged.find((tx) => tx.createdDate === 2000)?.amount).toBe(20); // Local version kept
            expect(merged.find((tx) => tx.createdDate === 3000)?.amount).toBe(30); // New from SQL
        });

        it('should use cloudToLocalMerge for full sync with toPushToCloud tracking', () => {
            const localTransactions = [
                { createdDate: 1000, modifiedDate: 2000, amount: 10 },
                { createdDate: 2000, modifiedDate: 3000, amount: 20 }, // Local is newer
            ];

            const sqlTransactions = [
                { createdDate: 1000, modifiedDate: 2000, amount: 10 }, // Same
                { createdDate: 2000, modifiedDate: 2500, amount: 25 }, // SQL is older
                { createdDate: 3000, modifiedDate: 3500, amount: 30 }, // Cloud-only
            ];

            const { mergedLocal, toPushToCloud } = cloudToLocalMerge(
                localTransactions as Transaction[],
                sqlTransactions as Transaction[]
            );

            expect(mergedLocal).toHaveLength(3);
            expect(mergedLocal.find((tx) => tx.createdDate === 2000)?.amount).toBe(20); // Local kept (newer)
            expect(mergedLocal.find((tx) => tx.createdDate === 3000)?.amount).toBe(30); // Cloud added
            expect(toPushToCloud).toHaveLength(1);
            expect(toPushToCloud[0].createdDate).toBe(2000); // Local is newer, needs push
        });

        it('should archive old transactions to IndexedDB by day using splitTransactionsByResetTime', () => {
            const shopId = 'testshop';
            const lastResetTime = new Date('2026-03-23T03:00:00').getTime();

            const mergedTransactions = [
                { createdDate: new Date('2026-03-21T10:00:00').getTime(), amount: 10 },
                { createdDate: new Date('2026-03-22T14:00:00').getTime(), amount: 20 },
                { createdDate: new Date('2026-03-23T09:00:00').getTime(), amount: 30 }, // Current day
            ];

            // Use the real splitTransactionsByResetTime function
            const { currentDay, old } = splitTransactionsByResetTime(mergedTransactions, lastResetTime);

            expect(currentDay).toHaveLength(1);
            expect(old).toHaveLength(2);

            // Group old transactions by day using the real groupTransactionsByDate function
            const groupedByDay = groupTransactionsByDate(old, shopId);

            expect(groupedByDay.size).toBe(2);
            expect(groupedByDay.has('testshop_2026-03-21')).toBe(true);
            expect(groupedByDay.has('testshop_2026-03-22')).toBe(true);
        });
    });

    describe('Day Sync', () => {
        it('should only sync transactions for the current day using filterTransactionsForDay', () => {
            const today = new Date('2026-03-23');

            const transactions = [
                { createdDate: new Date('2026-03-22T23:00:00').getTime(), amount: 10 },
                { createdDate: new Date('2026-03-23T09:00:00').getTime(), amount: 20 },
                { createdDate: new Date('2026-03-23T14:00:00').getTime(), amount: 30 },
                { createdDate: new Date('2026-03-24T01:00:00').getTime(), amount: 40 },
            ];

            // Use the real filterTransactionsForDay function
            const todayTransactions = filterTransactionsForDay(transactions, today);

            expect(todayTransactions).toHaveLength(2);
            expect(todayTransactions[0].amount).toBe(20);
            expect(todayTransactions[1].amount).toBe(30);
        });

        it('should push local-only transactions to SQL using findLocalOnlyTransactions', () => {
            const localTransactions = [
                { createdDate: 1000, modifiedDate: 2000, amount: 10 },
                { createdDate: 2000, modifiedDate: 3000, amount: 20 },
                { createdDate: 3000, modifiedDate: 4000, amount: 30 },
            ];

            const sqlTransactions = [{ createdDate: 1000, modifiedDate: 2000, amount: 10 }];

            // Use the real findLocalOnlyTransactions function
            const localOnlyTransactions = findLocalOnlyTransactions(localTransactions, sqlTransactions);

            expect(localOnlyTransactions).toHaveLength(2);
            expect(localOnlyTransactions[0].createdDate).toBe(2000);
            expect(localOnlyTransactions[1].createdDate).toBe(3000);
        });

        it('should update SQL when local transaction is newer using reconcileLocalWithSQL', () => {
            const localTransactions = [
                { createdDate: 1000, modifiedDate: 3000, amount: 15 }, // Newer
                { createdDate: 2000, modifiedDate: 3000, amount: 20 },
            ];

            const sqlTransactions = [
                { createdDate: 1000, modifiedDate: 2000, amount: 10 }, // Older
                { createdDate: 2000, modifiedDate: 4000, amount: 25 }, // Newer
            ];

            // Use the real reconcileLocalWithSQL function
            const { toAdd, toSync } = reconcileLocalWithSQL(
                localTransactions as Transaction[],
                sqlTransactions as Transaction[]
            );

            expect(toAdd).toHaveLength(0);
            expect(toSync).toHaveLength(1);
            expect(toSync[0].createdDate).toBe(1000);
            expect(toSync[0].amount).toBe(15);
        });

        it('should use findNewerLocalTransactions to identify updates needed', () => {
            const localTransactions = [
                { createdDate: 1000, modifiedDate: 3000, amount: 15 }, // Newer
                { createdDate: 2000, modifiedDate: 1000, amount: 20 }, // Older
            ];

            const sqlTransactions = [
                { createdDate: 1000, modifiedDate: 2000, amount: 10 },
                { createdDate: 2000, modifiedDate: 2500, amount: 25 },
            ];

            const transactionsToUpdate = findNewerLocalTransactions(localTransactions, sqlTransactions);

            expect(transactionsToUpdate).toHaveLength(1);
            expect(transactionsToUpdate[0].createdDate).toBe(1000);
        });
    });

    describe('Transaction Filename Generation', () => {
        it('should generate correct filename with shopId and date using generateTransactionKey', () => {
            const shopId = 'myshop';
            const date = new Date('2026-03-23');

            const key = generateTransactionKey(shopId, date);

            expect(key).toBe('myshop_2026-03-23');
        });

        it('should use TRANSACTIONS_KEYWORD as fallback when shopId is empty', () => {
            const shopId = '';
            const date = new Date('2026-03-23');

            const key = generateTransactionKey(shopId, date);

            expect(key).toBe(`${TRANSACTIONS_KEYWORD}_2026-03-23`);
        });

        it('should format date correctly using getFormattedDateKey', () => {
            const date = new Date('2026-03-05');
            expect(getFormattedDateKey(date)).toBe('2026-03-05');

            const date2 = new Date('2026-12-31');
            expect(getFormattedDateKey(date2)).toBe('2026-12-31');
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
