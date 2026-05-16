import { describe, expect, it } from 'vitest';
import {
    formatFrenchDate,
    generateReceiptNumber,
    getFormattedDate,
    getTransactionFileName,
    toSQLDateTime,
} from '../src/app/utils/date';

describe('getTransactionFileName', () => {
    it('generates file name with shop ID and current date', () => {
        const date = new Date('2026-05-16T12:00:00Z');
        const result = getTransactionFileName('annette', date);
        expect(result).toBe('annette_2026-05-16');
    });

    it('uses TRANSACTIONS_KEYWORD when shop ID is not provided', () => {
        const date = new Date('2026-05-16T12:00:00Z');
        const result = getTransactionFileName('', date);
        expect(result).toBe('Transactions_2026-05-16');
    });

    it('uses current date when date is not provided', () => {
        const result = getTransactionFileName('testshop');
        expect(result).toMatch(/^testshop_\d{4}-\d{2}-\d{2}$/);
    });

    it('handles empty shop ID', () => {
        const date = new Date('2026-05-16T12:00:00Z');
        const result = getTransactionFileName('', date);
        expect(result).toBe('Transactions_2026-05-16');
    });
});

describe('getFormattedDate', () => {
    it('formats date with full precision (YYYY-MM-DD)', () => {
        const date = new Date('2026-05-16T12:00:00Z');
        const result = getFormattedDate(date, 3);
        expect(result).toBe('2026-05-16');
    });

    it('formats date with year and month (YYYY-MM)', () => {
        const date = new Date('2026-05-16T12:00:00Z');
        const result = getFormattedDate(date, 2);
        expect(result).toBe('2026-05');
    });

    it('formats date with year only (YYYY)', () => {
        const date = new Date('2026-05-16T12:00:00Z');
        const result = getFormattedDate(date, 1);
        expect(result).toBe('2026');
    });

    it('uses current date when date is not provided', () => {
        const result = getFormattedDate(undefined, 3);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('handles invalid date', () => {
        const date = new Date('invalid');
        const result = getFormattedDate(date, 3);
        expect(result).toBe('');
    });

    it('pads month and day with leading zeros', () => {
        const date = new Date('2026-01-05T12:00:00Z');
        const result = getFormattedDate(date, 3);
        expect(result).toBe('2026-01-05');
    });

    it('handles December (month 12)', () => {
        const date = new Date('2026-12-31T12:00:00Z');
        const result = getFormattedDate(date, 3);
        expect(result).toBe('2026-12-31');
    });
});

describe('formatFrenchDate', () => {
    it('formats date and time in French locale', () => {
        const date = new Date('2026-05-16T14:30:45Z');
        const result = formatFrenchDate(date);
        expect(result.frenchDateStr).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        expect(result.frenchTimeStr).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('uses current date when date is not provided', () => {
        const result = formatFrenchDate();
        expect(result.frenchDateStr).toBeDefined();
        expect(result.frenchTimeStr).toBeDefined();
    });
});

describe('generateReceiptNumber', () => {
    it('generates receipt number with prefix', () => {
        const date = new Date('2026-05-16T12:00:00Z');
        const result = generateReceiptNumber('R', date);
        expect(result).toMatch(/^R\d+$/);
    });

    it('uses current date when date is not provided', () => {
        const result = generateReceiptNumber('R');
        expect(result).toMatch(/^R\d+$/);
    });

    it('generates different random numbers', () => {
        const date = new Date('2026-05-16T12:00:00Z');
        const result1 = generateReceiptNumber('R', date);
        const result2 = generateReceiptNumber('R', date);
        expect(result1).not.toBe(result2);
    });

    it('handles different prefixes', () => {
        const date = new Date('2026-05-16T12:00:00Z');
        const result = generateReceiptNumber('INV', date);
        expect(result).toMatch(/^INV\d+$/);
    });
});

describe('toSQLDateTime', () => {
    it('converts Date object to SQL datetime format', () => {
        const date = new Date('2026-05-16T14:30:45.123Z');
        const result = toSQLDateTime(date);
        expect(result).toBe('2026-05-16 14:30:45');
    });

    it('converts timestamp to SQL datetime format', () => {
        const timestamp = new Date('2026-05-16T14:30:45.123Z').getTime();
        const result = toSQLDateTime(timestamp);
        expect(result).toBe('2026-05-16 14:30:45');
    });

    it('handles timestamp with second precision (truncates ms)', () => {
        const timestamp = new Date('2026-05-16T14:30:45.000Z').getTime();
        const result = toSQLDateTime(timestamp);
        expect(result).toBe('2026-05-16 14:30:45');
    });

    it('handles UTC date correctly', () => {
        const date = new Date(Date.UTC(2026, 4, 16, 14, 30, 45));
        const result = toSQLDateTime(date);
        expect(result).toBe('2026-05-16 14:30:45');
    });

    it('handles date at midnight', () => {
        const date = new Date('2026-05-16T00:00:00Z');
        const result = toSQLDateTime(date);
        expect(result).toBe('2026-05-16 00:00:00');
    });

    it('handles date at end of day', () => {
        const date = new Date('2026-05-16T23:59:59Z');
        const result = toSQLDateTime(date);
        expect(result).toBe('2026-05-16 23:59:59');
    });

    it('truncates milliseconds from timestamp', () => {
        const timestamp = new Date('2026-05-16T14:30:45.999Z').getTime();
        const result = toSQLDateTime(timestamp);
        expect(result).toBe('2026-05-16 14:30:45');
    });
});
