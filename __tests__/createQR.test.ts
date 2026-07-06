import { describe, it, expect } from 'vitest';
import { createQR } from '../src/app/utils/createQR';

describe('createQR', () => {
    it('should create a QR code for a given string', () => {
        const result = createQR('test-data');
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
    });

    it('should create different QR codes for different inputs', () => {
        const qr1 = createQR('data-1');
        const qr2 = createQR('data-2');
        expect(qr1).not.toEqual(qr2);
    });

    it('should handle empty string', () => {
        const result = createQR('');
        expect(result).toBeDefined();
    });

    it('should handle special characters', () => {
        const result = createQR('test@#$%^&*()');
        expect(result).toBeDefined();
    });

    it('should handle long strings', () => {
        const longString = 'a'.repeat(1000);
        const result = createQR(longString);
        expect(result).toBeDefined();
    });
});
