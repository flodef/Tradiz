import { TRANSACTIONS_KEYWORD } from '../../utils/constants';
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

/**
 * Get formatted date string for transaction key.
 * Format: YYYY-MM-DD
 */
export function getFormattedDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Generate transaction key from shopId and date.
 * Format: shopId_YYYY-MM-DD
 */
export function generateTransactionKey(shopId: string, date: Date): string {
    const prefix = shopId || TRANSACTIONS_KEYWORD;
    return `${prefix}_${getFormattedDateKey(date)}`;
}

/**
 * Group transactions by date key.
 * Returns a Map where keys are date strings (YYYY-MM-DD) and values are arrays of transactions for that date.
 */
export function groupTransactionsByDate<T extends { createdDate: number }>(
    transactions: T[],
    shopId: string
): Map<string, T[]> {
    const grouped = new Map<string, T[]>();
    transactions.forEach((tx) => {
        const date = new Date(tx.createdDate);
        const dateKey = generateTransactionKey(shopId, date);
        if (!grouped.has(dateKey)) grouped.set(dateKey, []);
        grouped.get(dateKey)!.push(tx);
    });
    return grouped;
}

/**
 * Split transactions into current day and old transactions based on lastResetTime.
 */
export function splitTransactionsByResetTime<T extends { createdDate: number }>(
    transactions: T[],
    lastResetTime: number
): { currentDay: T[]; old: T[] } {
    return {
        currentDay: transactions.filter((tx) => tx.createdDate >= lastResetTime),
        old: transactions.filter((tx) => tx.createdDate < lastResetTime),
    };
}

/**
 * Filter transactions for a specific day.
 */
export function filterTransactionsForDay<T extends { createdDate: number }>(transactions: T[], date: Date): T[] {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return transactions.filter((tx) => {
        const txDate = new Date(tx.createdDate);
        return txDate >= dayStart && txDate <= dayEnd;
    });
}

/**
 * Find transactions that exist locally but not in SQL (need to be added).
 */
export function findLocalOnlyTransactions<T extends { createdDate: number }>(
    localTransactions: T[],
    sqlTransactions: T[]
): T[] {
    return localTransactions.filter(
        (localTx) => !sqlTransactions.find((sqlTx) => sqlTx.createdDate === localTx.createdDate)
    );
}

/**
 * Find transactions where local version is newer than SQL version (need to be synced).
 */
export function findNewerLocalTransactions<T extends { createdDate: number; modifiedDate: number }>(
    localTransactions: T[],
    sqlTransactions: T[]
): T[] {
    return localTransactions.filter((localTx) => {
        const sqlTx = sqlTransactions.find((s) => s.createdDate === localTx.createdDate);
        return sqlTx && localTx.modifiedDate > sqlTx.modifiedDate;
    });
}
