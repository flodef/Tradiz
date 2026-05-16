import { formatBytes } from '@/app/utils/transactionStore';
import { describe, expect, it } from 'vitest';

describe('formatBytes', () => {
    it('returns bytes for values less than 1KB', () => {
        expect(formatBytes(0)).toBe('0 o');
        expect(formatBytes(100)).toBe('100 o');
        expect(formatBytes(1023)).toBe('1023 o');
    });

    it('returns kilobytes for values between 1KB and 1MB', () => {
        expect(formatBytes(1024)).toBe('1.0 Ko');
        expect(formatBytes(2048)).toBe('2.0 Ko');
        expect(formatBytes(1536)).toBe('1.5 Ko');
        expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 Ko');
    });

    it('returns megabytes for values between 1MB and 1GB', () => {
        expect(formatBytes(1024 * 1024)).toBe('1.0 Mo');
        expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 Mo');
        expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 Mo');
        expect(formatBytes(1024 * 1024 * 1024 - 1)).toBe('1024.0 Mo');
    });

    it('returns gigabytes for values 1GB and above', () => {
        expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 Go');
        expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 Go');
        expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 Go');
    });

    it('handles edge cases at boundaries', () => {
        expect(formatBytes(1023)).toBe('1023 o');
        expect(formatBytes(1024)).toBe('1.0 Ko');
        expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 Ko');
        expect(formatBytes(1024 * 1024)).toBe('1.0 Mo');
        expect(formatBytes(1024 * 1024 * 1024 - 1)).toBe('1024.0 Mo');
        expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 Go');
    });

    it('handles very large numbers', () => {
        expect(formatBytes(10 * 1024 * 1024 * 1024)).toBe('10.0 Go');
        expect(formatBytes(100 * 1024 * 1024 * 1024)).toBe('100.0 Go');
    });
});
