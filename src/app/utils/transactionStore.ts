/**
 * IndexedDB-backed transaction storage.
 *
 * Stores transaction sets as key-value pairs (same pattern as the old localStorage):
 *   key   = transaction filename (e.g. "pauseiodee_2025-03-14")
 *   value = Transaction[]
 *
 * All methods are async since IndexedDB is asynchronous.
 */

import type { Transaction, TransactionSet } from './interfaces';

const DB_NAME = 'TradizTransactions';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';

// ── Open / upgrade the database ──────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ── CRUD operations ──────────────────────────────────────────────────────────

/** Get a single transaction set by key. Returns [] if not found. */
export async function idbGetTransactions(key: string): Promise<Transaction[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve((request.result as Transaction[]) ?? []);
        request.onerror = () => reject(request.error);
    });
}

/** Store a transaction set by key (overwrites). */
export async function idbSetTransactions(key: string, transactions: Transaction[]): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(transactions, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/** Remove a single key. */
export async function idbRemoveTransactions(key: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/** Get all keys in the store. */
export async function idbGetAllKeys(): Promise<string[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAllKeys();
        request.onsuccess = () => resolve(request.result as string[]);
        request.onerror = () => reject(request.error);
    });
}

/** Get all transaction sets (equivalent to getLocalTransactions). */
export async function idbGetAllTransactionSets(shopPrefix?: string): Promise<TransactionSet[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const sets: TransactionSet[] = [];

        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
                const key = cursor.key as string;
                if (!shopPrefix || key.includes(shopPrefix)) {
                    sets.push({ id: key, transactions: cursor.value as Transaction[] });
                }
                cursor.continue();
            } else {
                resolve(sets.sort((a, b) => a.id.localeCompare(b.id)));
            }
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
    });
}

// ── Migration: localStorage → IndexedDB ──────────────────────────────────────

/**
 * Migrate all transaction keys from localStorage into IndexedDB.
 * After each key is written to IDB, it is removed from localStorage.
 * Returns the number of keys migrated.
 */
export async function migrateLocalStorageToIDB(shopPrefix: string): Promise<number> {
    const keysToMigrate: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.split('_')[0] === shopPrefix) {
            keysToMigrate.push(key);
        }
    }

    let migrated = 0;
    for (const key of keysToMigrate) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
            const transactions = JSON.parse(raw) as Transaction[];
            // Merge with existing IDB data (in case partial migration happened before)
            const existing = await idbGetTransactions(key);
            if (existing.length) {
                // Merge: keep unique by createdDate, prefer newer modifiedDate
                const merged = [...existing];
                for (const tx of transactions) {
                    const idx = merged.findIndex((m) => m.createdDate === tx.createdDate);
                    if (idx === -1) {
                        merged.push(tx);
                    } else if (tx.modifiedDate > merged[idx].modifiedDate) {
                        merged[idx] = tx;
                    }
                }
                await idbSetTransactions(key, merged);
            } else {
                await idbSetTransactions(key, transactions);
            }
            localStorage.removeItem(key);
            migrated++;
        } catch (e) {
            console.error(`Failed to migrate key "${key}":`, e);
        }
    }

    return migrated;
}

// ── Storage usage estimation ─────────────────────────────────────────────────

export interface StorageUsage {
    used: number; // bytes
    quota: number; // bytes
    usedFormatted: string;
    quotaFormatted: string;
    percentUsed: number;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' Go';
}

export async function getStorageUsage(): Promise<StorageUsage> {
    if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage ?? 0;
        const quota = estimate.quota ?? 0;
        return {
            used,
            quota,
            usedFormatted: formatBytes(used),
            quotaFormatted: formatBytes(quota),
            percentUsed: quota > 0 ? Math.round((used / quota) * 10000) / 100 : 0,
        };
    }
    // Fallback: no estimate available
    return { used: 0, quota: 0, usedFormatted: '?', quotaFormatted: '?', percentUsed: 0 };
}
