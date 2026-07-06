import { describe, it, expect } from 'vitest';
import { generateProductReference, validateProductReference } from '../src/app/utils/productReference';

describe('generateProductReference', () => {
    it('should generate a 13-digit reference', () => {
        const ref = generateProductReference(1);
        expect(ref).toBeDefined();
        expect(ref.length).toBe(13);
    });

    it('should generate consistent references for same product ID', () => {
        const ref1 = generateProductReference(1);
        const ref2 = generateProductReference(1);
        expect(ref1).toBe(ref2);
    });

    it('should generate different references for different product IDs', () => {
        const ref1 = generateProductReference(1);
        const ref2 = generateProductReference(2);
        expect(ref1).not.toBe(ref2);
    });

    it('should pad product ID to 9 digits', () => {
        const ref = generateProductReference(123);
        expect(ref).toMatch(/^300000000123\d$/);
    });

    it('should start with France GS1 prefix (300)', () => {
        const ref = generateProductReference(1);
        expect(ref.startsWith('300')).toBe(true);
    });

    it('should handle large product IDs', () => {
        const ref = generateProductReference(999999999);
        expect(ref).toBeDefined();
        expect(ref.length).toBe(13);
    });
});

describe('validateProductReference', () => {
    it('should validate a correct EAN-13 reference', () => {
        const ref = generateProductReference(1);
        expect(validateProductReference(ref)).toBe(true);
    });

    it('should reject invalid length', () => {
        expect(validateProductReference('123')).toBe(false);
        expect(validateProductReference('12345678901234')).toBe(false);
    });

    it('should reject non-numeric characters', () => {
        expect(validateProductReference('300000000001a')).toBe(false);
    });

    it('should reject invalid checksum', () => {
        expect(validateProductReference('3000000000000')).toBe(false);
    });
});
