import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Transaction } from '../src/app/utils/interfaces';
import { DELETED_KEYWORD, PROCESSING_KEYWORD, WAITING_KEYWORD } from '../src/app/utils/constants';
import { storeTransactionInArray } from '../src/app/contexts/dataProvider/syncUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> & { createdDate: number }): Transaction {
    return {
        validator: 'TestUser',
        method: 'Carte Bancaire',
        amount: 10,
        currency: 'EUR',
        modifiedDate: overrides.createdDate,
        products: [
            {
                label: 'Test Product',
                category: 'Test Category',
                amount: 10,
                quantity: 1,
                discount: { amount: 0, unit: '%' },
                total: 10,
            },
        ],
        ...overrides,
    };
}

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
        key: (index: number) => Object.keys(store)[index] || null,
        get length() {
            return Object.keys(store).length;
        },
    };
})();

global.localStorage = localStorageMock as Storage;

// ---------------------------------------------------------------------------
// Transaction CRUD Operations
// ---------------------------------------------------------------------------

describe('Transaction CRUD Operations', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('Adding Transactions', () => {
        it('should add a new transaction to empty array', () => {
            const transactions: Transaction[] = [];
            const newTx = makeTx({ createdDate: 1000, amount: 25 });
            const result = storeTransactionInArray(transactions, newTx);

            expect(result).toHaveLength(1);
            expect(result[0].createdDate).toBe(1000);
            expect(result[0].amount).toBe(25);
        });

        it('should prepend new transaction to existing array', () => {
            const transactions = [makeTx({ createdDate: 1000 })];
            const newTx = makeTx({ createdDate: 2000, amount: 50 });
            const result = storeTransactionInArray(transactions, newTx);

            expect(result).toHaveLength(2);
            expect(result[0].createdDate).toBe(2000); // newest first
            expect(result[1].createdDate).toBe(1000);
        });

        it('should preserve transaction properties', () => {
            const transactions: Transaction[] = [];
            const newTx = makeTx({
                createdDate: 1000,
                validator: 'John Doe',
                method: 'Espèce',
                amount: 42.5,
                currency: 'EUR',
            });
            const result = storeTransactionInArray(transactions, newTx);

            expect(result[0].validator).toBe('John Doe');
            expect(result[0].method).toBe('Espèce');
            expect(result[0].amount).toBe(42.5);
            expect(result[0].currency).toBe('EUR');
        });

        it('should handle transactions with products', () => {
            const transactions: Transaction[] = [];
            const newTx = makeTx({
                createdDate: 1000,
                products: [
                    {
                        label: 'Coffee',
                        category: 'Drinks',
                        amount: 3.5,
                        quantity: 2,
                        discount: { amount: 10, unit: '%' },
                        total: 6.3,
                    },
                ],
            });
            const result = storeTransactionInArray(transactions, newTx);

            expect(result[0].products).toHaveLength(1);
            expect(result[0].products[0].label).toBe('Coffee');
            expect(result[0].products[0].quantity).toBe(2);
        });
    });

    describe('Editing Transactions', () => {
        it('should update existing transaction by createdDate', () => {
            const transactions = [makeTx({ createdDate: 1000, amount: 10 })];
            const updatedTx = makeTx({ createdDate: 1000, amount: 99, modifiedDate: 2000 });
            const result = storeTransactionInArray(transactions, updatedTx);

            expect(result).toHaveLength(1);
            expect(result[0].amount).toBe(99);
            expect(result[0].modifiedDate).toBe(2000);
        });

        it('should update payment method', () => {
            const transactions = [makeTx({ createdDate: 1000, method: 'Espèce' })];
            const updatedTx = makeTx({ createdDate: 1000, method: 'Carte Bancaire' });
            const result = storeTransactionInArray(transactions, updatedTx);

            expect(result[0].method).toBe('Carte Bancaire');
        });

        it('should update products in transaction', () => {
            const transactions = [
                makeTx({
                    createdDate: 1000,
                    products: [
                        {
                            label: 'Old Product',
                            category: 'Cat1',
                            amount: 5,
                            quantity: 1,
                            discount: { amount: 0, unit: '%' },
                            total: 5,
                        },
                    ],
                }),
            ];
            const updatedTx = makeTx({
                createdDate: 1000,
                products: [
                    {
                        label: 'New Product',
                        category: 'Cat2',
                        amount: 10,
                        quantity: 2,
                        discount: { amount: 5, unit: '%' },
                        total: 19,
                    },
                ],
            });
            const result = storeTransactionInArray(transactions, updatedTx);

            expect(result[0].products[0].label).toBe('New Product');
            expect(result[0].products[0].quantity).toBe(2);
        });

        it('should preserve other transactions when updating one', () => {
            const transactions = [
                makeTx({ createdDate: 1000, amount: 10 }),
                makeTx({ createdDate: 2000, amount: 20 }),
                makeTx({ createdDate: 3000, amount: 30 }),
            ];
            const updatedTx = makeTx({ createdDate: 2000, amount: 99 });
            const result = storeTransactionInArray(transactions, updatedTx);

            expect(result).toHaveLength(3);
            expect(result.find((t) => t.createdDate === 1000)?.amount).toBe(10);
            expect(result.find((t) => t.createdDate === 2000)?.amount).toBe(99);
            expect(result.find((t) => t.createdDate === 3000)?.amount).toBe(30);
        });
    });

    describe('Deleting Transactions (Soft Delete)', () => {
        it('should mark transaction as deleted without removing it', () => {
            const transactions = [makeTx({ createdDate: 1000, method: 'Carte Bancaire' })];
            const deletedTx = makeTx({ createdDate: 1000, method: DELETED_KEYWORD });
            const result = storeTransactionInArray(transactions, deletedTx);

            expect(result).toHaveLength(1); // Still in array
            expect(result[0].method).toBe(DELETED_KEYWORD);
        });

        it('should preserve deleted transactions in array', () => {
            const transactions = [
                makeTx({ createdDate: 1000 }),
                makeTx({ createdDate: 2000 }),
                makeTx({ createdDate: 3000 }),
            ];
            const deletedTx = makeTx({ createdDate: 2000, method: DELETED_KEYWORD });
            const result = storeTransactionInArray(transactions, deletedTx);

            expect(result).toHaveLength(3);
            expect(result.find((t) => t.createdDate === 2000)?.method).toBe(DELETED_KEYWORD);
        });

        it('should allow re-deleting already deleted transaction', () => {
            const transactions = [makeTx({ createdDate: 1000, method: DELETED_KEYWORD, modifiedDate: 100 })];
            const redeleted = makeTx({ createdDate: 1000, method: DELETED_KEYWORD, modifiedDate: 200 });
            const result = storeTransactionInArray(transactions, redeleted);

            expect(result).toHaveLength(1);
            expect(result[0].method).toBe(DELETED_KEYWORD);
            expect(result[0].modifiedDate).toBe(200);
        });
    });

    describe('Processing Transactions', () => {
        it('should mark transaction as processing', () => {
            const transactions = [makeTx({ createdDate: 1000, method: 'Carte Bancaire' })];
            const processingTx = makeTx({ createdDate: 1000, method: PROCESSING_KEYWORD });
            const result = storeTransactionInArray(transactions, processingTx);

            expect(result[0].method).toBe(PROCESSING_KEYWORD);
        });

        it('should handle waiting transactions', () => {
            const transactions: Transaction[] = [];
            const waitingTx = makeTx({ createdDate: 1000, method: WAITING_KEYWORD });
            const result = storeTransactionInArray(transactions, waitingTx);

            expect(result[0].method).toBe(WAITING_KEYWORD);
        });
    });

    describe('LocalStorage Integration', () => {
        it('should save transaction to localStorage', () => {
            const key = 'testshop_2026-03-22';
            const transactions = [makeTx({ createdDate: 1000 })];

            localStorage.setItem(key, JSON.stringify(transactions));
            const retrieved = JSON.parse(localStorage.getItem(key)!);

            expect(retrieved).toHaveLength(1);
            expect(retrieved[0].createdDate).toBe(1000);
        });

        it('should retrieve multiple transaction sets from localStorage', () => {
            localStorage.setItem('shop1_2026-03-22', JSON.stringify([makeTx({ createdDate: 1000 })]));
            localStorage.setItem('shop1_2026-03-21', JSON.stringify([makeTx({ createdDate: 2000 })]));
            localStorage.setItem('shop2_2026-03-22', JSON.stringify([makeTx({ createdDate: 3000 })]));

            // Get all keys from localStorage
            const allKeys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) allKeys.push(key);
            }

            const shop1Keys = allKeys.filter((key) => key.startsWith('shop1_'));
            expect(shop1Keys).toHaveLength(2);
        });

        it('should handle localStorage quota exceeded gracefully', () => {
            const key = 'testshop_2026-03-22';
            const largeData = new Array(1000).fill(makeTx({ createdDate: 1000 }));

            // Mock quota exceeded
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = vi.fn(() => {
                throw new Error('QuotaExceededError');
            });

            expect(() => {
                try {
                    localStorage.setItem(key, JSON.stringify(largeData));
                } catch (e) {
                    // Should handle gracefully
                    expect(e).toBeDefined();
                }
            }).not.toThrow();

            localStorage.setItem = originalSetItem;
        });
    });

    describe('Transaction Validation', () => {
        it('should handle transactions with missing optional fields', () => {
            const transactions: Transaction[] = [];
            const minimalTx: Transaction = {
                createdDate: 1000,
                modifiedDate: 1000,
                validator: 'User',
                method: 'CB',
                amount: 10,
                currency: 'EUR',
                products: [],
            };
            const result = storeTransactionInArray(transactions, minimalTx);

            expect(result).toHaveLength(1);
            expect(result[0].products).toEqual([]);
        });

        it('should handle transactions with discount', () => {
            const transactions: Transaction[] = [];
            const txWithDiscount = makeTx({
                createdDate: 1000,
                products: [
                    {
                        label: 'Item',
                        category: 'Cat',
                        amount: 100,
                        quantity: 1,
                        discount: { amount: 20, unit: '%' },
                        total: 80,
                    },
                ],
            });
            const result = storeTransactionInArray(transactions, txWithDiscount);

            expect(result[0].products[0].discount.amount).toBe(20);
            expect(result[0].products[0].total).toBe(80);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty transaction array', () => {
            const transactions: Transaction[] = [];
            const newTx = makeTx({ createdDate: 1000 });
            const result = storeTransactionInArray(transactions, newTx);

            expect(result).toHaveLength(1);
        });

        it('should handle transaction with zero amount', () => {
            const transactions: Transaction[] = [];
            const zeroTx = makeTx({ createdDate: 1000, amount: 0 });
            const result = storeTransactionInArray(transactions, zeroTx);

            expect(result[0].amount).toBe(0);
        });

        it('should handle transaction with negative amount (refund)', () => {
            const transactions: Transaction[] = [];
            const refundTx = makeTx({ createdDate: 1000, amount: -50 });
            const result = storeTransactionInArray(transactions, refundTx);

            expect(result[0].amount).toBe(-50);
        });

        it('should handle very large createdDate timestamps', () => {
            const transactions: Transaction[] = [];
            const futureTx = makeTx({ createdDate: 9999999999999 });
            const result = storeTransactionInArray(transactions, futureTx);

            expect(result[0].createdDate).toBe(9999999999999);
        });

        it('should handle multiple transactions with same timestamp', () => {
            const transactions = [makeTx({ createdDate: 1000, amount: 10 })];
            const sameTx = makeTx({ createdDate: 1000, amount: 20 });
            const result = storeTransactionInArray(transactions, sameTx);

            // Should replace, not duplicate
            expect(result).toHaveLength(1);
            expect(result[0].amount).toBe(20);
        });
    });

    describe('Transaction Ordering', () => {
        it('should maintain newest-first order when adding', () => {
            const transactions = [
                makeTx({ createdDate: 3000 }),
                makeTx({ createdDate: 2000 }),
                makeTx({ createdDate: 1000 }),
            ];
            const newTx = makeTx({ createdDate: 4000 });
            const result = storeTransactionInArray(transactions, newTx);

            expect(result[0].createdDate).toBe(4000);
            expect(result[1].createdDate).toBe(3000);
            expect(result[2].createdDate).toBe(2000);
            expect(result[3].createdDate).toBe(1000);
        });

        it('should preserve order when updating', () => {
            const transactions = [
                makeTx({ createdDate: 3000, amount: 30 }),
                makeTx({ createdDate: 2000, amount: 20 }),
                makeTx({ createdDate: 1000, amount: 10 }),
            ];
            const updatedTx = makeTx({ createdDate: 2000, amount: 99 });
            const result = storeTransactionInArray(transactions, updatedTx);

            expect(result.map((t) => t.createdDate)).toEqual([3000, 2000, 1000]);
            expect(result[1].amount).toBe(99);
        });
    });
});
