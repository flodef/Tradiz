import { computeTransactionHash } from '@/app/utils/transactionHash';
import { generateTransactionHash } from '@/app/api/sql/saveTransaction/route';
import { describe, it, expect } from 'vitest';

describe('computeTransactionHash — regression tests', () => {
    const baseTx = {
        order_id: '12345',
        user_name: 'TestUser',
        payment_method: 'CB',
        amount: 10.5,
        currency: 'EUR',
        created_at: '2026-05-16 12:00:00',
        change: '',
        device_id: null,
    };

    it('produces a deterministic hash for a fixed input (pins the format)', () => {
        const hash = computeTransactionHash(baseTx);
        expect(hash).toBe('4aa2d99f7bc7764f28305f5f84b4c57968992710e92c8e1727b309f646b387db');
    });

    it('produces a deterministic hash with transactionId', () => {
        const hash = computeTransactionHash(baseTx, 42);
        expect(hash).toBe('a09b3caf560e7b83888ceb79fc87c8674a84cf6f1a0af91402e50ecd72bab470');
    });

    it('produces a deterministic hash with transactionId and previousHash', () => {
        const hash = computeTransactionHash(baseTx, 42, 'abc123previoushash');
        expect(hash).toBe('35e47ee3a9f44ab2dc622b1630ab06577b428d33664a67e1b73a988cf1ab7714');
    });

    it('normalizes amount via Number() — "12.50" and 12.5 produce the same hash', () => {
        const txString = { ...baseTx, amount: '12.50' as unknown as number };
        const txNumber = { ...baseTx, amount: 12.5 };
        expect(computeTransactionHash(txString, 1)).toBe(computeTransactionHash(txNumber, 1));
    });

    it('generateTransactionHash (saveTransaction re-export) matches computeTransactionHash', () => {
        const tx = { ...baseTx, updated_at: '2026-05-16 12:00:00', note: '' };
        expect(generateTransactionHash(tx, 42, 'prev')).toBe(computeTransactionHash(tx, 42, 'prev'));
    });
});
