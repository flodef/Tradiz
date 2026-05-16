import { describe, it, expect } from 'vitest';
import { Transaction } from '../src/app/utils/interfaces';
import {
    DELETED_KEYWORD,
    PROCESSING_KEYWORD,
    REFUND_KEYWORD,
    UPDATING_KEYWORD,
    WAITING_KEYWORD,
} from '../src/app/utils/constants';
import {
    isWaitingTransaction,
    isUpdatingTransaction,
    isProcessingTransaction,
    isDeletedTransaction,
    isRefundTransaction,
    isConfirmedTransaction,
} from '../src/app/contexts/dataProvider/transactionHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
    return {
        validator: 'TestUser',
        method: 'CB',
        amount: 10,
        currency: 'EUR',
        createdDate: 1000,
        modifiedDate: 1000,
        products: [],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Transaction Helper Tests
// ---------------------------------------------------------------------------

describe('isWaitingTransaction', () => {
    it('returns true for waiting keyword', () => {
        expect(isWaitingTransaction(makeTx({ method: WAITING_KEYWORD }))).toBe(true);
    });

    it('returns false for normal method', () => {
        expect(isWaitingTransaction(makeTx({ method: 'CB' }))).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isWaitingTransaction(undefined)).toBe(false);
    });

    it('returns false for deleted transaction', () => {
        expect(isWaitingTransaction(makeTx({ method: DELETED_KEYWORD }))).toBe(false);
    });
});

describe('isUpdatingTransaction', () => {
    it('returns true for updating keyword', () => {
        expect(isUpdatingTransaction(makeTx({ method: UPDATING_KEYWORD }))).toBe(true);
    });

    it('returns false for normal method', () => {
        expect(isUpdatingTransaction(makeTx({ method: 'CB' }))).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isUpdatingTransaction(undefined)).toBe(false);
    });
});

describe('isProcessingTransaction', () => {
    it('returns true for processing keyword', () => {
        expect(isProcessingTransaction(makeTx({ method: PROCESSING_KEYWORD }))).toBe(true);
    });

    it('returns false for normal method', () => {
        expect(isProcessingTransaction(makeTx({ method: 'CB' }))).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isProcessingTransaction(undefined)).toBe(false);
    });
});

describe('isDeletedTransaction', () => {
    it('returns true for deleted keyword', () => {
        expect(isDeletedTransaction(makeTx({ method: DELETED_KEYWORD }))).toBe(true);
    });

    it('returns false for normal method', () => {
        expect(isDeletedTransaction(makeTx({ method: 'CB' }))).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isDeletedTransaction(undefined)).toBe(false);
    });
});

describe('isRefundTransaction', () => {
    it('returns true for refund keyword', () => {
        expect(isRefundTransaction(makeTx({ method: REFUND_KEYWORD }))).toBe(true);
    });

    it('returns false for normal method', () => {
        expect(isRefundTransaction(makeTx({ method: 'CB' }))).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isRefundTransaction(undefined)).toBe(false);
    });
});

describe('isConfirmedTransaction', () => {
    it('returns true for normal confirmed transaction', () => {
        expect(isConfirmedTransaction(makeTx({ method: 'CB' }))).toBe(true);
    });

    it('returns false for waiting transaction', () => {
        expect(isConfirmedTransaction(makeTx({ method: WAITING_KEYWORD }))).toBe(false);
    });

    it('returns false for deleted transaction', () => {
        expect(isConfirmedTransaction(makeTx({ method: DELETED_KEYWORD }))).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isConfirmedTransaction(undefined)).toBe(false);
    });

    it('returns false for processing transaction', () => {
        expect(isConfirmedTransaction(makeTx({ method: PROCESSING_KEYWORD }))).toBe(false);
    });

    it('returns false for updating transaction', () => {
        expect(isConfirmedTransaction(makeTx({ method: UPDATING_KEYWORD }))).toBe(false);
    });
});

describe('Transaction helper edge cases', () => {
    it('handles transaction with missing method', () => {
        const tx = makeTx({ method: undefined as any });
        expect(isWaitingTransaction(tx)).toBe(false);
        expect(isDeletedTransaction(tx)).toBe(false);
        expect(isConfirmedTransaction(tx)).toBe(false);
    });

    it('handles transaction with empty string method', () => {
        const tx = makeTx({ method: '' });
        expect(isWaitingTransaction(tx)).toBe(false);
        expect(isDeletedTransaction(tx)).toBe(false);
        expect(isConfirmedTransaction(tx)).toBe(true);
    });

    it('handles transaction with null method', () => {
        const tx = makeTx({ method: null as any });
        expect(isWaitingTransaction(tx)).toBe(false);
        expect(isDeletedTransaction(tx)).toBe(false);
        expect(isConfirmedTransaction(tx)).toBe(false);
    });
});
