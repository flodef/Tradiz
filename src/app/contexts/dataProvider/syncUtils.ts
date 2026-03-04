import { Transaction } from '../../utils/interfaces';
import { isProcessingTransaction } from './transactionHelpers';

/**
 * Merge two transaction arrays. For duplicates (same createdDate),
 * the one with the latest modifiedDate wins.
 */
export function mergeTransactionArrays(local: Transaction[], remote: Transaction[]): Transaction[] {
    const merged = [...local];
    for (const remoteTx of remote) {
        const localIndex = merged.findIndex((tx) => tx.createdDate === remoteTx.createdDate);
        if (localIndex === -1) {
            merged.push(remoteTx);
        } else if (remoteTx.modifiedDate > merged[localIndex].modifiedDate) {
            merged[localIndex] = remoteTx;
        }
    }
    return merged;
}

/**
 * Store (upsert) a transaction in the array. If a transaction with the same
 * createdDate exists, replace it. Otherwise prepend it.
 * Returns a new array.
 */
export function storeTransactionInArray(transactions: Transaction[], transaction: Transaction): Transaction[] {
    const result = [...transactions];
    const index = result.findIndex(({ createdDate }) => createdDate === transaction.createdDate);
    if (index >= 0) {
        result.splice(index, 1, transaction);
    } else {
        result.unshift(transaction);
    }
    return result;
}

/**
 * Simulate cloud→local merge from fullSync.
 * For each cloud transaction:
 *   - If not in local → add to local
 *   - If in local and cloud is newer (modifiedDate) → update local
 *   - If in local and local is newer → mark for push to cloud
 * Returns { mergedLocal, toPushToCloud }.
 */
export function cloudToLocalMerge(
    localTransactions: Transaction[],
    cloudTransactions: Transaction[]
): { mergedLocal: Transaction[]; toPushToCloud: Transaction[] } {
    const mergedLocal = [...localTransactions];
    const toPushToCloud: Transaction[] = [];

    for (const cloudTx of cloudTransactions) {
        const localIndex = mergedLocal.findIndex((tx) => tx.createdDate === cloudTx.createdDate);

        if (localIndex === -1) {
            // Cloud-only → add to local
            mergedLocal.push(cloudTx);
        } else {
            const localTx = mergedLocal[localIndex];
            if (cloudTx.modifiedDate > localTx.modifiedDate) {
                // Cloud is newer → update local
                mergedLocal[localIndex] = cloudTx;
            } else if (cloudTx.modifiedDate < localTx.modifiedDate) {
                // Local is newer → needs push to cloud
                toPushToCloud.push(localTx);
            }
        }
    }

    return { mergedLocal, toPushToCloud };
}

/**
 * Determine which local transactions need to be pushed to SQL.
 * Returns:
 *   - toAdd: local-only transactions (not in SQL)
 *   - toSync: local transactions that are newer than SQL version
 */
export function reconcileLocalWithSQL(
    localTransactions: Transaction[],
    sqlTransactions: Transaction[]
): { toAdd: Transaction[]; toSync: Transaction[] } {
    const toAdd: Transaction[] = [];
    const toSync: Transaction[] = [];

    for (const localTx of localTransactions) {
        if (isProcessingTransaction(localTx)) continue;

        const sqlTx = sqlTransactions.find((s) => s.createdDate === localTx.createdDate);
        if (!sqlTx) {
            toAdd.push(localTx);
        } else if (localTx.modifiedDate > sqlTx.modifiedDate) {
            toSync.push(localTx);
        }
    }

    return { toAdd, toSync };
}

/**
 * Filter out processing transactions (for localStorage persistence).
 */
export function filterProcessingTransactions(transactions: Transaction[]): Transaction[] {
    return transactions.filter((tx) => !isProcessingTransaction(tx));
}

/**
 * Simulate a full multi-device sync cycle for a single device.
 * 1. Cloud→local merge (latest modifiedDate wins)
 * 2. Local→cloud reconciliation (identify what to push)
 */
export function simulateDeviceSync(
    localTransactions: Transaction[],
    sqlTransactions: Transaction[]
): {
    updatedLocal: Transaction[];
    toAddToSQL: Transaction[];
    toSyncToSQL: Transaction[];
} {
    // Step 1: Cloud→Local merge
    const { mergedLocal } = cloudToLocalMerge(localTransactions, sqlTransactions);

    // Step 2: Local→SQL reconciliation (using merged local against original SQL)
    const { toAdd, toSync } = reconcileLocalWithSQL(mergedLocal, sqlTransactions);

    return {
        updatedLocal: mergedLocal,
        toAddToSQL: toAdd,
        toSyncToSQL: toSync,
    };
}
