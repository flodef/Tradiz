import { describe, it, expect } from 'vitest';
import { Transaction } from '@/app/utils/interfaces';
import { DELETED_KEYWORD, PROCESSING_KEYWORD, WAITING_KEYWORD } from '@/app/utils/constants';
import {
    mergeTransactionArrays,
    storeTransactionInArray,
    cloudToLocalMerge,
    reconcileLocalWithSQL,
    filterProcessingTransactions,
    simulateDeviceSync,
} from '@/app/contexts/dataProvider/syncUtils';
import { isDeletedTransaction, isProcessingTransaction } from '@/app/contexts/dataProvider/transactionHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> & { createdDate: number }): Transaction {
    return {
        validator: 'user',
        method: 'CB',
        amount: 10,
        currency: 'EUR',
        modifiedDate: overrides.createdDate,
        products: [{ label: 'item', category: 'cat', amount: 10, quantity: 1, discount: { amount: 0, unit: '' } }],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Unit tests — transaction helpers
// ---------------------------------------------------------------------------

describe('isDeletedTransaction', () => {
    it('returns true for deleted keyword', () => {
        expect(isDeletedTransaction(makeTx({ createdDate: 1, method: DELETED_KEYWORD }))).toBe(true);
    });
    it('returns false for normal method', () => {
        expect(isDeletedTransaction(makeTx({ createdDate: 1, method: 'CB' }))).toBe(false);
    });
    it('returns false for undefined', () => {
        expect(isDeletedTransaction(undefined)).toBe(false);
    });
});

describe('isProcessingTransaction', () => {
    it('returns true for processing keyword', () => {
        expect(isProcessingTransaction(makeTx({ createdDate: 1, method: PROCESSING_KEYWORD }))).toBe(true);
    });
    it('returns false for normal method', () => {
        expect(isProcessingTransaction(makeTx({ createdDate: 1 }))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Unit tests — mergeTransactionArrays
// ---------------------------------------------------------------------------

describe('mergeTransactionArrays', () => {
    it('adds remote-only transactions', () => {
        const local = [makeTx({ createdDate: 1 })];
        const remote = [makeTx({ createdDate: 2 })];
        const merged = mergeTransactionArrays(local, remote);
        expect(merged).toHaveLength(2);
        expect(merged.map((t) => t.createdDate)).toContain(1);
        expect(merged.map((t) => t.createdDate)).toContain(2);
    });

    it('keeps local when local is newer', () => {
        const local = [makeTx({ createdDate: 1, modifiedDate: 200, amount: 99 })];
        const remote = [makeTx({ createdDate: 1, modifiedDate: 100, amount: 50 })];
        const merged = mergeTransactionArrays(local, remote);
        expect(merged).toHaveLength(1);
        expect(merged[0].amount).toBe(99);
    });

    it('replaces local when remote is newer', () => {
        const local = [makeTx({ createdDate: 1, modifiedDate: 100, amount: 50 })];
        const remote = [makeTx({ createdDate: 1, modifiedDate: 200, amount: 99 })];
        const merged = mergeTransactionArrays(local, remote);
        expect(merged).toHaveLength(1);
        expect(merged[0].amount).toBe(99);
    });

    it('keeps both when modifiedDate is equal', () => {
        const local = [makeTx({ createdDate: 1, modifiedDate: 100, amount: 50 })];
        const remote = [makeTx({ createdDate: 1, modifiedDate: 100, amount: 50 })];
        const merged = mergeTransactionArrays(local, remote);
        expect(merged).toHaveLength(1);
        expect(merged[0].amount).toBe(50);
    });

    it('preserves deleted flag from remote when remote is newer', () => {
        const local = [makeTx({ createdDate: 1, modifiedDate: 100, method: 'CB' })];
        const remote = [makeTx({ createdDate: 1, modifiedDate: 200, method: DELETED_KEYWORD })];
        const merged = mergeTransactionArrays(local, remote);
        expect(merged[0].method).toBe(DELETED_KEYWORD);
    });

    it('handles empty arrays', () => {
        expect(mergeTransactionArrays([], [])).toEqual([]);
        expect(mergeTransactionArrays([], [makeTx({ createdDate: 1 })])).toHaveLength(1);
        expect(mergeTransactionArrays([makeTx({ createdDate: 1 })], [])).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Unit tests — storeTransactionInArray
// ---------------------------------------------------------------------------

describe('storeTransactionInArray', () => {
    it('prepends new transaction', () => {
        const existing = [makeTx({ createdDate: 1 })];
        const newTx = makeTx({ createdDate: 2, amount: 20 });
        const result = storeTransactionInArray(existing, newTx);
        expect(result).toHaveLength(2);
        expect(result[0].createdDate).toBe(2); // prepended
    });

    it('replaces existing transaction by createdDate', () => {
        const existing = [makeTx({ createdDate: 1, amount: 10 })];
        const updated = makeTx({ createdDate: 1, amount: 99 });
        const result = storeTransactionInArray(existing, updated);
        expect(result).toHaveLength(1);
        expect(result[0].amount).toBe(99);
    });

    it('keeps deleted transaction in array (soft-delete)', () => {
        const existing = [makeTx({ createdDate: 1, method: 'CB' })];
        const deleted = makeTx({ createdDate: 1, method: DELETED_KEYWORD });
        const result = storeTransactionInArray(existing, deleted);
        expect(result).toHaveLength(1);
        expect(result[0].method).toBe(DELETED_KEYWORD);
    });

    it('does not remove deleted transaction from array', () => {
        const existing = [makeTx({ createdDate: 1 }), makeTx({ createdDate: 2 })];
        const deleted = makeTx({ createdDate: 1, method: DELETED_KEYWORD });
        const result = storeTransactionInArray(existing, deleted);
        // Both transactions still present — deleted is flagged, not removed
        expect(result).toHaveLength(2);
        expect(result.find((t) => t.createdDate === 1)?.method).toBe(DELETED_KEYWORD);
        expect(result.find((t) => t.createdDate === 2)?.method).toBe('CB');
    });
});

// ---------------------------------------------------------------------------
// Unit tests — cloudToLocalMerge
// ---------------------------------------------------------------------------

describe('cloudToLocalMerge', () => {
    it('adds cloud-only transactions to local', () => {
        const local = [makeTx({ createdDate: 1 })];
        const cloud = [makeTx({ createdDate: 2 })];
        const { mergedLocal } = cloudToLocalMerge(local, cloud);
        expect(mergedLocal).toHaveLength(2);
    });

    it('updates local when cloud is newer', () => {
        const local = [makeTx({ createdDate: 1, modifiedDate: 100, amount: 10 })];
        const cloud = [makeTx({ createdDate: 1, modifiedDate: 200, amount: 50 })];
        const { mergedLocal } = cloudToLocalMerge(local, cloud);
        expect(mergedLocal[0].amount).toBe(50);
    });

    it('identifies local-newer transactions to push to cloud', () => {
        const local = [makeTx({ createdDate: 1, modifiedDate: 200, amount: 50 })];
        const cloud = [makeTx({ createdDate: 1, modifiedDate: 100, amount: 10 })];
        const { mergedLocal, toPushToCloud } = cloudToLocalMerge(local, cloud);
        expect(mergedLocal[0].amount).toBe(50); // local preserved
        expect(toPushToCloud).toHaveLength(1);
        expect(toPushToCloud[0].amount).toBe(50);
    });
});

// ---------------------------------------------------------------------------
// Unit tests — reconcileLocalWithSQL
// ---------------------------------------------------------------------------

describe('reconcileLocalWithSQL', () => {
    it('identifies local-only transactions to add', () => {
        const local = [makeTx({ createdDate: 1 }), makeTx({ createdDate: 2 })];
        const sql = [makeTx({ createdDate: 1 })];
        const { toAdd, toSync } = reconcileLocalWithSQL(local, sql);
        expect(toAdd).toHaveLength(1);
        expect(toAdd[0].createdDate).toBe(2);
        expect(toSync).toHaveLength(0);
    });

    it('identifies local-newer transactions to sync', () => {
        const local = [makeTx({ createdDate: 1, modifiedDate: 200, amount: 99 })];
        const sql = [makeTx({ createdDate: 1, modifiedDate: 100, amount: 10 })];
        const { toAdd, toSync } = reconcileLocalWithSQL(local, sql);
        expect(toAdd).toHaveLength(0);
        expect(toSync).toHaveLength(1);
        expect(toSync[0].amount).toBe(99);
    });

    it('skips processing transactions', () => {
        const local = [makeTx({ createdDate: 1, method: PROCESSING_KEYWORD })];
        const sql: Transaction[] = [];
        const { toAdd, toSync } = reconcileLocalWithSQL(local, sql);
        expect(toAdd).toHaveLength(0);
        expect(toSync).toHaveLength(0);
    });

    it('does not flag transactions where SQL is newer', () => {
        const local = [makeTx({ createdDate: 1, modifiedDate: 100 })];
        const sql = [makeTx({ createdDate: 1, modifiedDate: 200 })];
        const { toAdd, toSync } = reconcileLocalWithSQL(local, sql);
        expect(toAdd).toHaveLength(0);
        expect(toSync).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Unit tests — filterProcessingTransactions
// ---------------------------------------------------------------------------

describe('filterProcessingTransactions', () => {
    it('removes processing transactions', () => {
        const txs = [
            makeTx({ createdDate: 1 }),
            makeTx({ createdDate: 2, method: PROCESSING_KEYWORD }),
            makeTx({ createdDate: 3, method: DELETED_KEYWORD }),
        ];
        const result = filterProcessingTransactions(txs);
        expect(result).toHaveLength(2);
        expect(result.map((t) => t.createdDate)).toEqual([1, 3]);
    });
});

// ---------------------------------------------------------------------------
// Multi-device sync scenarios
// ---------------------------------------------------------------------------

describe('Multi-device sync scenarios', () => {
    describe('Scenario 1: Device A adds tx, Device B deletes it', () => {
        const txCreatedDate = 1000;

        // Device A adds a transaction
        const txOnA = makeTx({ createdDate: txCreatedDate, modifiedDate: 100, method: 'CB', amount: 25 });

        // This tx gets saved to SQL (simulated)
        const sqlAfterAdd = [txOnA];

        // Device B syncs and gets it
        it('Device B sees the tx after sync', () => {
            const deviceBLocal: Transaction[] = [];
            const { updatedLocal } = simulateDeviceSync(deviceBLocal, sqlAfterAdd);
            expect(updatedLocal).toHaveLength(1);
            expect(updatedLocal[0].method).toBe('CB');
        });

        // Device B deletes the tx (marks as deleted with newer modifiedDate)
        const deletedTx = makeTx({
            createdDate: txCreatedDate,
            modifiedDate: 200,
            method: DELETED_KEYWORD,
            amount: 25,
        });

        // SQL now has the deleted version
        const sqlAfterDelete = [deletedTx];

        it('Device A sees deletion after sync (deleted propagates via SQL)', () => {
            // Device A still has original tx locally
            const deviceALocal = [txOnA];
            const { updatedLocal } = simulateDeviceSync(deviceALocal, sqlAfterDelete);

            // After sync, Device A's local should be updated to DELETED
            const tx = updatedLocal.find((t) => t.createdDate === txCreatedDate);
            expect(tx).toBeDefined();
            expect(tx!.method).toBe(DELETED_KEYWORD);
        });

        it('deleted tx is kept in array (soft-delete, not removed)', () => {
            const deviceALocal = [txOnA];
            const { updatedLocal } = simulateDeviceSync(deviceALocal, sqlAfterDelete);
            expect(updatedLocal).toHaveLength(1); // still in array
        });
    });

    describe('Scenario 2: Device A adds tx offline, syncs later', () => {
        const offlineTx = makeTx({ createdDate: 2000, modifiedDate: 100, amount: 42 });

        it('offline tx is identified for push to SQL', () => {
            const deviceALocal = [offlineTx];
            const sqlTransactions: Transaction[] = []; // SQL has nothing

            const { toAddToSQL } = simulateDeviceSync(deviceALocal, sqlTransactions);
            expect(toAddToSQL).toHaveLength(1);
            expect(toAddToSQL[0].createdDate).toBe(2000);
        });

        it('after push, Device B picks it up on next sync', () => {
            // Simulate: offlineTx now exists in SQL after Device A pushed it
            const sqlAfterPush = [offlineTx];
            const deviceBLocal: Transaction[] = [];

            const { updatedLocal } = simulateDeviceSync(deviceBLocal, sqlAfterPush);
            expect(updatedLocal).toHaveLength(1);
            expect(updatedLocal[0].amount).toBe(42);
        });
    });

    describe('Scenario 3: Device A edits tx, propagates to Device B', () => {
        const originalTx = makeTx({ createdDate: 3000, modifiedDate: 100, amount: 10, method: 'CB' });
        const editedTx = makeTx({ createdDate: 3000, modifiedDate: 200, amount: 50, method: 'CB' });

        it('Device A edits tx and pushes to SQL', () => {
            // After Device A edits, SQL has the edited version
            const sqlAfterEdit = [editedTx];
            const deviceBLocal = [originalTx];

            const { updatedLocal } = simulateDeviceSync(deviceBLocal, sqlAfterEdit);
            expect(updatedLocal).toHaveLength(1);
            expect(updatedLocal[0].amount).toBe(50); // updated to edited version
            expect(updatedLocal[0].modifiedDate).toBe(200);
        });
    });

    describe('Scenario 4: Device A edits tx offline, syncs later', () => {
        const originalInSQL = makeTx({ createdDate: 4000, modifiedDate: 100, amount: 10 });
        const editedLocally = makeTx({ createdDate: 4000, modifiedDate: 200, amount: 75 });

        it('local-newer tx is identified for sync to SQL', () => {
            const deviceALocal = [editedLocally];
            const sqlTransactions = [originalInSQL];

            const { toSyncToSQL, toAddToSQL } = simulateDeviceSync(deviceALocal, sqlTransactions);
            expect(toAddToSQL).toHaveLength(0);
            expect(toSyncToSQL).toHaveLength(1);
            expect(toSyncToSQL[0].amount).toBe(75);
        });

        it('after sync, Device B gets the updated version', () => {
            // SQL now has the edited version after Device A synced
            const sqlAfterSync = [editedLocally];
            const deviceBLocal = [originalInSQL];

            const { updatedLocal } = simulateDeviceSync(deviceBLocal, sqlAfterSync);
            expect(updatedLocal[0].amount).toBe(75);
        });
    });

    describe('Scenario 5: Both devices edit same tx (conflict, last edit wins)', () => {
        const editByA = makeTx({ createdDate: 5000, modifiedDate: 200, amount: 30 });
        const editByB = makeTx({ createdDate: 5000, modifiedDate: 300, amount: 60 });

        it('when both edit, latest modifiedDate wins on sync', () => {
            // Device A edits at T=200, Device B edits at T=300
            // SQL has Device A's version (it synced first)
            const sqlAfterASync = [editByA];

            // Device B syncs with its newer local version
            const deviceBLocal = [editByB];
            const resultB = simulateDeviceSync(deviceBLocal, sqlAfterASync);

            // B's local should keep B's version (it's newer)
            expect(resultB.updatedLocal[0].amount).toBe(60);
            // B should push its version to SQL
            expect(resultB.toSyncToSQL).toHaveLength(1);
            expect(resultB.toSyncToSQL[0].amount).toBe(60);
        });

        it("after B pushes, Device A converges to B's version", () => {
            // SQL now has B's version (T=300)
            const sqlAfterBSync = [editByB];
            const deviceALocal = [editByA]; // A still has T=200

            const resultA = simulateDeviceSync(deviceALocal, sqlAfterBSync);
            // A should update to B's version (cloud is newer)
            expect(resultA.updatedLocal[0].amount).toBe(60);
            expect(resultA.updatedLocal[0].modifiedDate).toBe(300);
            // Nothing to push (SQL is already correct)
            expect(resultA.toSyncToSQL).toHaveLength(0);
            expect(resultA.toAddToSQL).toHaveLength(0);
        });
    });

    describe('Scenario 6: Delete propagates in both directions', () => {
        const tx1 = makeTx({ createdDate: 6000, modifiedDate: 100, method: 'CB', amount: 15 });
        const tx2 = makeTx({ createdDate: 6001, modifiedDate: 100, method: 'CB', amount: 25 });

        it('Device A deletes tx1 locally, Device B deletes tx2 locally — both propagate', () => {
            const deletedTx1 = { ...tx1, modifiedDate: 200, method: DELETED_KEYWORD };
            const deletedTx2 = { ...tx2, modifiedDate: 200, method: DELETED_KEYWORD };

            // SQL has both original transactions
            // Device A has deleted tx1, still has original tx2
            // Device B has original tx1, deleted tx2
            const deviceALocal = [deletedTx1, tx2];
            const deviceBLocal = [tx1, deletedTx2];

            // Step 1: Device A syncs — pushes deletedTx1 to SQL
            const resultA = simulateDeviceSync(deviceALocal, [tx1, tx2]);
            expect(resultA.toSyncToSQL).toHaveLength(1);
            expect(resultA.toSyncToSQL[0].createdDate).toBe(6000);
            expect(resultA.toSyncToSQL[0].method).toBe(DELETED_KEYWORD);

            // Step 2: Device B syncs — pushes deletedTx2 to SQL
            const resultB = simulateDeviceSync(deviceBLocal, [tx1, tx2]);
            expect(resultB.toSyncToSQL).toHaveLength(1);
            expect(resultB.toSyncToSQL[0].createdDate).toBe(6001);
            expect(resultB.toSyncToSQL[0].method).toBe(DELETED_KEYWORD);

            // Step 3: SQL now has both deleted — both devices sync again
            const sqlFinal = [deletedTx1, deletedTx2];

            const finalA = simulateDeviceSync(deviceALocal, sqlFinal);
            expect(finalA.updatedLocal.filter((t) => t.method === DELETED_KEYWORD)).toHaveLength(2);
            expect(finalA.toSyncToSQL).toHaveLength(0);
            expect(finalA.toAddToSQL).toHaveLength(0);

            const finalB = simulateDeviceSync(deviceBLocal, sqlFinal);
            expect(finalB.updatedLocal.filter((t) => t.method === DELETED_KEYWORD)).toHaveLength(2);
            expect(finalB.toSyncToSQL).toHaveLength(0);
            expect(finalB.toAddToSQL).toHaveLength(0);
        });
    });

    describe('Scenario 7: Multiple transactions, mixed operations', () => {
        it('handles add + edit + delete across devices correctly', () => {
            const tx1 = makeTx({ createdDate: 7000, modifiedDate: 100, amount: 10 });
            const tx2 = makeTx({ createdDate: 7001, modifiedDate: 100, amount: 20 });
            const tx3 = makeTx({ createdDate: 7002, modifiedDate: 100, amount: 30 });

            // SQL has tx1, tx2, tx3
            const sqlState = [tx1, tx2, tx3];

            // Device A: edits tx1 (amount → 99), deletes tx2, adds tx4
            const tx1EditedByA = makeTx({ createdDate: 7000, modifiedDate: 200, amount: 99 });
            const tx2DeletedByA = makeTx({ createdDate: 7001, modifiedDate: 200, method: DELETED_KEYWORD, amount: 20 });
            const tx4ByA = makeTx({ createdDate: 7003, modifiedDate: 200, amount: 40 });
            const deviceALocal = [tx1EditedByA, tx2DeletedByA, tx3, tx4ByA];

            const resultA = simulateDeviceSync(deviceALocal, sqlState);

            // tx1: local newer → sync
            expect(resultA.toSyncToSQL.find((t) => t.createdDate === 7000)?.amount).toBe(99);
            // tx2: local newer (deleted) → sync
            expect(resultA.toSyncToSQL.find((t) => t.createdDate === 7001)?.method).toBe(DELETED_KEYWORD);
            // tx3: same → nothing
            expect(resultA.toSyncToSQL.find((t) => t.createdDate === 7002)).toBeUndefined();
            // tx4: local-only → add
            expect(resultA.toAddToSQL.find((t) => t.createdDate === 7003)?.amount).toBe(40);
        });
    });

    describe('Scenario 8: Waiting transactions are preserved', () => {
        it('waiting transactions sync normally and are not treated as deleted', () => {
            const waitingTx = makeTx({ createdDate: 8000, modifiedDate: 100, method: WAITING_KEYWORD });
            const normalTx = makeTx({ createdDate: 8001, modifiedDate: 100, method: 'CB' });

            const local: Transaction[] = [];
            const sql = [waitingTx, normalTx];

            const { updatedLocal } = simulateDeviceSync(local, sql);
            expect(updatedLocal).toHaveLength(2);
            expect(updatedLocal.find((t) => t.createdDate === 8000)?.method).toBe(WAITING_KEYWORD);
        });
    });
});
