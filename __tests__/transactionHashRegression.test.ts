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
        expect(hash).toBe('85351acd6e622cb4168dde0deeb0a8dabd785d8fbe9961221d73d072db207e6c');
    });

    it('produces a deterministic hash with transactionId', () => {
        const hash = computeTransactionHash(baseTx, 42);
        expect(hash).toBe('980e4e0f8539c17b5f5aa01615025c042b0d4b909f28fd19e62568e11dc7ae0b');
    });

    it('produces a deterministic hash with transactionId and previousHash', () => {
        const hash = computeTransactionHash(baseTx, 42, 'abc123previoushash');
        expect(hash).toBe('13dc73cebcd1c29bc8c09a79965b4b74e75523bf5e4650a471fddbd92b1b4bfd');
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
