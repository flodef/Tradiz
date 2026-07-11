import { describe, it, expect } from 'vitest';
import { createQROptions } from '../src/app/utils/createQR';

describe('createQROptions', () => {
    it('should create QR options for a given string', () => {
        const result = createQROptions('test-data');
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
        expect(result.data).toBe('test-data');
    });

    it('should create different QR options for different inputs', () => {
        const qr1 = createQROptions('data-1');
        const qr2 = createQROptions('data-2');
        expect(qr1.data).not.toEqual(qr2.data);
    });

    it('should handle empty string', () => {
        const result = createQROptions('');
        expect(result).toBeDefined();
        expect(result.data).toBe('');
    });

    it('should handle special characters', () => {
        const result = createQROptions('test@#$%^&*()');
        expect(result).toBeDefined();
        expect(result.data).toBe('test@#$%^&*()');
    });

    it('should handle long strings', () => {
        const longString = 'a'.repeat(1000);
        const result = createQROptions(longString);
        expect(result).toBeDefined();
        expect(result.data).toBe(longString);
    });
});
