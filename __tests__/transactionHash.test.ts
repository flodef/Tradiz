import { generateTransactionHash } from '@/app/api/sql/saveTransaction/route';
import { computeTransactionHash } from '@/app/utils/transactionHash';
import { describe, it, expect } from 'vitest';

describe('generateTransactionHash', () => {
    it('generates a hash string', () => {
        const transaction = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
            note: '',
        };
        const hash = generateTransactionHash(transaction);
        expect(typeof hash).toBe('string');
        expect(hash).toBeTruthy();
    });

    it('generates different hashes for different transactions', () => {
        const tx1 = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
            note: '',
        };
        const tx2 = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 20.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
            note: '',
        };
        expect(generateTransactionHash(tx1)).not.toBe(generateTransactionHash(tx2));
    });

    it('generates same hash for identical transactions', () => {
        const tx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
            note: '',
        };
        expect(generateTransactionHash(tx)).toBe(generateTransactionHash(tx));
    });

    it('includes transactionId in hash when provided', () => {
        const tx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
            note: '',
        };
        const hash1 = generateTransactionHash(tx, 'id1');
        const hash2 = generateTransactionHash(tx, 'id2');
        expect(hash1).not.toBe(hash2);
    });

    it('handles missing change field', () => {
        const tx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
        };
        const hash = generateTransactionHash(tx);
        expect(hash).toBeTruthy();
    });

    it('handles empty string change', () => {
        const tx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
            change: '',
        };
        const hash = generateTransactionHash(tx);
        expect(hash).toBeTruthy();
    });

    it('includes change in hash when provided', () => {
        const tx1 = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
            change: 'Test change',
        };
        const tx2 = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
            change: 'Different change',
        };
        expect(generateTransactionHash(tx1)).not.toBe(generateTransactionHash(tx2));
    });

    it('generates a full 64-character SHA-256 hash', () => {
        const tx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
        };
        const hash = generateTransactionHash(tx);
        expect(hash).toHaveLength(64);
    });

    it('includes previousHash in hash computation (hash chaining)', () => {
        const tx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
        };
        const hashWithoutPrev = generateTransactionHash(tx);
        const hashWithPrev = generateTransactionHash(tx, undefined, 'abc123previoushash');
        expect(hashWithoutPrev).not.toBe(hashWithPrev);
    });

    it('produces different hashes when chained with different previous hashes', () => {
        const tx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
        };
        const hash1 = generateTransactionHash(tx, undefined, 'prevHash1');
        const hash2 = generateTransactionHash(tx, undefined, 'prevHash2');
        expect(hash1).not.toBe(hash2);
    });

    it('includes line items in the hash — different items produce different hashes', () => {
        const baseTx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
        };
        const itemsA = [{ label: 'Café', quantity: 2, amount: 2.5, total: 5.0, vat_rate: 20 }];
        const itemsB = [{ label: 'Thé', quantity: 2, amount: 2.5, total: 5.0, vat_rate: 20 }];
        expect(computeTransactionHash({ ...baseTx, items: itemsA }, 1)).not.toBe(
            computeTransactionHash({ ...baseTx, items: itemsB }, 1)
        );
    });

    it('detects quantity changes in line items', () => {
        const baseTx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
        };
        const itemsA = [{ label: 'Café', quantity: 2, amount: 2.5, total: 5.0, vat_rate: 20 }];
        const itemsB = [{ label: 'Café', quantity: 3, amount: 2.5, total: 7.5, vat_rate: 20 }];
        expect(computeTransactionHash({ ...baseTx, items: itemsA }, 1)).not.toBe(
            computeTransactionHash({ ...baseTx, items: itemsB }, 1)
        );
    });

    it('detects price changes in line items', () => {
        const baseTx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
        };
        const itemsA = [{ label: 'Café', quantity: 2, amount: 2.5, total: 5.0, vat_rate: 20 }];
        const itemsB = [{ label: 'Café', quantity: 2, amount: 3.0, total: 6.0, vat_rate: 20 }];
        expect(computeTransactionHash({ ...baseTx, items: itemsA }, 1)).not.toBe(
            computeTransactionHash({ ...baseTx, items: itemsB }, 1)
        );
    });

    it('detects VAT rate changes in line items', () => {
        const baseTx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
        };
        const itemsA = [{ label: 'Café', quantity: 2, amount: 2.5, total: 5.0, vat_rate: 20 }];
        const itemsB = [{ label: 'Café', quantity: 2, amount: 2.5, total: 5.0, vat_rate: 10 }];
        expect(computeTransactionHash({ ...baseTx, items: itemsA }, 1)).not.toBe(
            computeTransactionHash({ ...baseTx, items: itemsB }, 1)
        );
    });

    it('produces same hash regardless of item insertion order (canonical sorting)', () => {
        const baseTx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
        };
        const itemsOrder1 = [
            { label: 'Café', quantity: 2, amount: 2.5, total: 5.0, vat_rate: 20 },
            { label: 'Thé', quantity: 1, amount: 3.0, total: 3.0, vat_rate: 10 },
        ];
        const itemsOrder2 = [
            { label: 'Thé', quantity: 1, amount: 3.0, total: 3.0, vat_rate: 10 },
            { label: 'Café', quantity: 2, amount: 2.5, total: 5.0, vat_rate: 20 },
        ];
        expect(computeTransactionHash({ ...baseTx, items: itemsOrder1 }, 1)).toBe(
            computeTransactionHash({ ...baseTx, items: itemsOrder2 }, 1)
        );
    });

    it('transaction without items produces same hash as transaction with empty items array', () => {
        const baseTx = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
        };
        expect(computeTransactionHash(baseTx, 1)).toBe(computeTransactionHash({ ...baseTx, items: [] }, 1));
    });
});
