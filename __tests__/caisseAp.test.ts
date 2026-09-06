import { describe, it, expect } from 'vitest';
import {
    encodeCaisseApMessage,
    decodeCaisseApMessage,
    buildPaymentRequest,
    parsePaymentResponse,
} from '@/app/utils/caisseAp';

describe('encodeCaisseApMessage', () => {
    it('encodes a simple message in TLV format', () => {
        const msg = { CZ: '0300', CA: '01' };
        expect(encodeCaisseApMessage(msg)).toBe('CZ0040300CA00201');
    });

    it('always puts CZ first', () => {
        const msg = { CA: '01', CZ: '0300', CE: '978' };
        const encoded = encodeCaisseApMessage(msg);
        expect(encoded.startsWith('CZ0040300')).toBe(true);
    });

    it('handles values with length >= 100', () => {
        const longValue = 'A'.repeat(120);
        const msg = { CZ: '0300', AA: longValue };
        const encoded = encodeCaisseApMessage(msg);
        expect(encoded).toContain('AA120' + longValue);
    });

    it('throws on invalid tag length', () => {
        expect(() => encodeCaisseApMessage({ ABC: 'val' })).toThrow('Invalid tag length');
    });

    it('throws on value too long', () => {
        expect(() => encodeCaisseApMessage({ CZ: 'A'.repeat(1000) })).toThrow('Invalid value length');
    });
});

describe('decodeCaisseApMessage', () => {
    it('decodes a TLV string back to a message dict', () => {
        const encoded = 'CZ0040300CA00201CE003978';
        const decoded = decodeCaisseApMessage(encoded);
        expect(decoded).toEqual({ CZ: '0300', CA: '01', CE: '978' });
    });

    it('round-trips with encode', () => {
        const original = { CZ: '0300', CJ: '012345678901', CA: '01', CE: '978', BA: '0', CD: '0', CB: '1500' };
        const encoded = encodeCaisseApMessage(original);
        const decoded = decodeCaisseApMessage(encoded);
        expect(decoded).toEqual(original);
    });

    it('handles truncated data gracefully', () => {
        const decoded = decodeCaisseApMessage('CZ004');
        expect(decoded).toEqual({});
    });
});

describe('buildPaymentRequest', () => {
    it('builds a standard debit request', () => {
        const msg = buildPaymentRequest({ amount: 15.0 });
        expect(msg.CZ).toBe('0300');
        expect(msg.CE).toBe('978');
        expect(msg.CA).toBe('01');
        expect(msg.BA).toBe('0');
        expect(msg.CD).toBe('0');
        expect(msg.CB).toBe('1500');
    });

    it('converts amount to cents', () => {
        const msg = buildPaymentRequest({ amount: 99.99 });
        expect(msg.CB).toBe('9999');
    });

    it('handles small amounts with leading zeros', () => {
        const msg = buildPaymentRequest({ amount: 0.5 });
        expect(msg.CB).toBe('50');
    });

    it('handles zero amount', () => {
        const msg = buildPaymentRequest({ amount: 0 });
        expect(msg.CB).toBe('00');
    });

    it('sets CD to 1 for reimbursement', () => {
        const msg = buildPaymentRequest({ amount: 10, isReimbursement: true });
        expect(msg.CD).toBe('1');
        expect(msg.CB).toBe('1000');
    });

    it('uses absolute value for amount', () => {
        const msg = buildPaymentRequest({ amount: -10 });
        expect(msg.CB).toBe('1000');
    });

    it('adds CC tag for checks', () => {
        const msg = buildPaymentRequest({ amount: 50, isCheck: true });
        expect(msg.CC).toBe('00C');
    });

    it('throws on amount too large', () => {
        expect(() => buildPaymentRequest({ amount: 10000000000 })).toThrow('Amount too large');
    });
});

describe('parsePaymentResponse', () => {
    it('parses a successful response', () => {
        const response = {
            AE: '10',
            AC: '123456',
            AA: '4929********1234',
            AB: '1228',
            AI: 'A0000000041010',
            CC: '00C',
            CI: 'VISA',
            CG: '1234567',
        };
        const result = parsePaymentResponse(response);
        expect(result.success).toBe(true);
        expect(result.authorizationNumber).toBe('123456');
        expect(result.cardNumber).toBe('4929********1234');
        expect(result.cardExpiry).toBe('1228');
        expect(result.aid).toBe('A0000000041010');
        expect(result.paymentMode).toBe('00C');
        expect(result.cardType).toBe('VISA');
        expect(result.sellerContract).toBe('1234567');
        expect(result.errorCode).toBeUndefined();
    });

    it('parses a failure response', () => {
        const response = { AE: '01', AF: 'Carte refusée' };
        const result = parsePaymentResponse(response);
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('01');
        expect(result.errorDetail).toBe('Carte refusée');
    });

    it('parses an immediate ack response (AE=11)', () => {
        const response = { AE: '11' };
        const result = parsePaymentResponse(response);
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('11');
    });
});
