import { describe, it, expect } from 'vitest';
import { getPaymentBreakdown } from '@/app/utils/paymentBreakdown';
import { encodePaymentLegs, parsePaymentLegs } from '@/app/utils/transactionNote';
import { MULTI_KEYWORD, CASH_KEYWORD } from '@/app/utils/constants';
import type { Transaction, PaymentLeg } from '@/app/utils/interfaces';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
    return {
        validator: 'test',
        method: 'Carte Bancaire',
        amount: 50,
        createdDate: 1000,
        modifiedDate: 1000,
        currency: 'EUR',
        products: [],
        ...overrides,
    };
}

const legs: PaymentLeg[] = [
    { method: CASH_KEYWORD, amount: 20, cashReceived: 20 },
    { method: 'Carte Bancaire', amount: 30 },
];

describe('getPaymentBreakdown', () => {
    it('returns payments array when present', () => {
        const tx = makeTx({ method: MULTI_KEYWORD, amount: 50, payments: legs });
        expect(getPaymentBreakdown(tx)).toEqual(legs);
    });

    it('falls back to single-leg array for legacy transactions', () => {
        const tx = makeTx({ method: 'Carte Bancaire', amount: 50 });
        expect(getPaymentBreakdown(tx)).toEqual([{ method: 'Carte Bancaire', amount: 50 }]);
    });

    it('falls back when payments is an empty array', () => {
        const tx = makeTx({ method: 'Chèque', amount: 15, payments: [] });
        expect(getPaymentBreakdown(tx)).toEqual([{ method: 'Chèque', amount: 15 }]);
    });

    it('falls back when payments is undefined', () => {
        const tx = makeTx({ method: 'Espèces', amount: 10 });
        expect(getPaymentBreakdown(tx)).toEqual([{ method: 'Espèces', amount: 10 }]);
    });

    it('preserves optional fields on legs (cashReceived, changeGiven, label)', () => {
        const fullLegs: PaymentLeg[] = [
            { method: CASH_KEYWORD, amount: 20, cashReceived: 25, changeGiven: 5, label: 'Cash' },
            { method: 'Carte Bancaire', amount: 30, label: 'CB' },
        ];
        const tx = makeTx({ method: MULTI_KEYWORD, amount: 50, payments: fullLegs });
        expect(getPaymentBreakdown(tx)).toEqual(fullLegs);
    });
});

describe('encodePaymentLegs', () => {
    it('encodes legs as JSON string', () => {
        const encoded = encodePaymentLegs(legs);
        expect(encoded).not.toBeNull();
        expect(JSON.parse(encoded!)).toEqual(legs);
    });

    it('returns null for empty array', () => {
        expect(encodePaymentLegs([])).toBeNull();
    });

    it('returns null for undefined input', () => {
        expect(encodePaymentLegs(undefined as unknown as PaymentLeg[])).toBeNull();
    });

    it('preserves optional fields in encoding', () => {
        const fullLegs: PaymentLeg[] = [
            { method: CASH_KEYWORD, amount: 20, cashReceived: 25, changeGiven: 5 },
        ];
        const encoded = encodePaymentLegs(fullLegs);
        expect(JSON.parse(encoded!)).toEqual(fullLegs);
    });
});

describe('parsePaymentLegs', () => {
    it('round-trips encodePaymentLegs output', () => {
        const encoded = encodePaymentLegs(legs);
        expect(parsePaymentLegs(encoded)).toEqual(legs);
    });

    it('returns undefined for empty string', () => {
        expect(parsePaymentLegs('')).toBeUndefined();
    });

    it('returns undefined for null', () => {
        expect(parsePaymentLegs(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
        expect(parsePaymentLegs(undefined)).toBeUndefined();
    });

    it('returns undefined for invalid JSON', () => {
        expect(parsePaymentLegs('not json')).toBeUndefined();
    });

    it('returns undefined for non-array JSON', () => {
        expect(parsePaymentLegs(JSON.stringify({ method: 'CB', amount: 10 }))).toBeUndefined();
    });

    it('returns undefined for array with invalid leg (missing method)', () => {
        expect(parsePaymentLegs(JSON.stringify([{ amount: 10 }]))).toBeUndefined();
    });

    it('returns undefined for array with invalid leg (missing amount)', () => {
        expect(parsePaymentLegs(JSON.stringify([{ method: 'CB' }]))).toBeUndefined();
    });

    it('returns undefined for array with non-string method', () => {
        expect(parsePaymentLegs(JSON.stringify([{ method: 123, amount: 10 }]))).toBeUndefined();
    });

    it('returns undefined for array with non-number amount', () => {
        expect(parsePaymentLegs(JSON.stringify([{ method: 'CB', amount: '10' }]))).toBeUndefined();
    });

    it('parses legs with optional fields', () => {
        const fullLegs: PaymentLeg[] = [
            { method: CASH_KEYWORD, amount: 20, cashReceived: 25, changeGiven: 5, label: 'Cash' },
        ];
        const encoded = encodePaymentLegs(fullLegs);
        expect(parsePaymentLegs(encoded)).toEqual(fullLegs);
    });
});

describe('multi-payment summary aggregation', () => {
    // Simulates the logic used in useSummary.tsx getTransactionsDetails
    function aggregatePayments(transactions: Transaction[]): Record<string, { quantity: number; amount: number }> {
        const payments = new Map<string, { quantity: number; amount: number }>();
        for (const tx of transactions) {
            const breakdown = getPaymentBreakdown(tx);
            const isMulti = tx.method === MULTI_KEYWORD && breakdown.length > 1;
            if (isMulti) {
                for (const leg of breakdown) {
                    const existing = payments.get(leg.method);
                    if (existing) {
                        existing.quantity += 1;
                        existing.amount += leg.amount;
                    } else {
                        payments.set(leg.method, { quantity: 1, amount: leg.amount });
                    }
                }
            } else {
                const existing = payments.get(tx.method);
                if (existing) {
                    existing.quantity += 1;
                    existing.amount += tx.amount;
                } else {
                    payments.set(tx.method, { quantity: 1, amount: tx.amount });
                }
            }
        }
        return Object.fromEntries(payments);
    }

    it('expands multi-payment into individual methods', () => {
        const tx = makeTx({
            method: MULTI_KEYWORD,
            amount: 50,
            payments: [
                { method: CASH_KEYWORD, amount: 20 },
                { method: 'Carte Bancaire', amount: 30 },
            ],
        });
        const result = aggregatePayments([tx]);
        expect(result[CASH_KEYWORD]).toEqual({ quantity: 1, amount: 20 });
        expect(result['Carte Bancaire']).toEqual({ quantity: 1, amount: 30 });
        expect(result[MULTI_KEYWORD]).toBeUndefined();
    });

    it('counts single-method transactions normally', () => {
        const tx1 = makeTx({ method: 'Carte Bancaire', amount: 50 });
        const tx2 = makeTx({ method: 'Carte Bancaire', amount: 15 });
        const result = aggregatePayments([tx1, tx2]);
        expect(result['Carte Bancaire']).toEqual({ quantity: 2, amount: 65 });
    });

    it('mixes multi-payment and single-payment transactions', () => {
        const multiTx = makeTx({
            method: MULTI_KEYWORD,
            amount: 50,
            payments: [
                { method: CASH_KEYWORD, amount: 20 },
                { method: 'Carte Bancaire', amount: 30 },
            ],
        });
        const singleTx = makeTx({ method: CASH_KEYWORD, amount: 10 });
        const result = aggregatePayments([multiTx, singleTx]);
        expect(result[CASH_KEYWORD]).toEqual({ quantity: 2, amount: 30 });
        expect(result['Carte Bancaire']).toEqual({ quantity: 1, amount: 30 });
    });

    it('handles multi-payment with same method on multiple legs', () => {
        const tx = makeTx({
            method: MULTI_KEYWORD,
            amount: 40,
            payments: [
                { method: CASH_KEYWORD, amount: 15 },
                { method: CASH_KEYWORD, amount: 25 },
            ],
        });
        const result = aggregatePayments([tx]);
        expect(result[CASH_KEYWORD]).toEqual({ quantity: 2, amount: 40 });
    });

    it('does not expand transactions with payments array but non-MULTI method', () => {
        // Edge case: a transaction that has a payments array but method is not MULTI_KEYWORD
        // Should be treated as a single payment using tx.method
        const tx = makeTx({
            method: 'Carte Bancaire',
            amount: 50,
            payments: [{ method: CASH_KEYWORD, amount: 50 }],
        });
        const result = aggregatePayments([tx]);
        expect(result['Carte Bancaire']).toEqual({ quantity: 1, amount: 50 });
        expect(result[CASH_KEYWORD]).toBeUndefined();
    });
});
