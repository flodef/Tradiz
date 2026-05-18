import { generateTransactionHash } from '@/app/api/sql/saveTransaction/route';
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

    it('handles missing note field', () => {
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

    it('handles empty string note', () => {
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
        const hash = generateTransactionHash(tx);
        expect(hash).toBeTruthy();
    });

    it('includes note in hash when provided', () => {
        const tx1 = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
            note: 'Test note',
        };
        const tx2 = {
            order_id: '12345',
            user_name: 'TestUser',
            payment_method: 'CB',
            amount: 10.5,
            currency: 'EUR',
            created_at: '2026-05-16 12:00:00',
            updated_at: '2026-05-16 12:00:00',
            note: 'Different note',
        };
        expect(generateTransactionHash(tx1)).not.toBe(generateTransactionHash(tx2));
    });
});
