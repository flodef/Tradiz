import { computeEan13Checksum, generateEan13Barcode, validateEan13 } from '@/app/utils/barcode';
import { describe, expect, it } from 'vitest';

describe('barcode', () => {
    it('computes a valid EAN-13 checksum', () => {
        expect(computeEan13Checksum('978020137500')).toBe('9780201375008');
        expect(computeEan13Checksum('300000000000')).toBe('3000000000007');
    });

    it('validates a known valid EAN-13', () => {
        expect(validateEan13('9780201375008')).toBe(true);
        expect(validateEan13('3000000000007')).toBe(true);
    });

    it('rejects an invalid checksum', () => {
        expect(validateEan13('9780201375001')).toBe(false);
    });

    it('rejects non-13 digit values', () => {
        expect(validateEan13('123456789012')).toBe(false);
        expect(validateEan13('')).toBe(false);
        expect(validateEan13('abcdefghijklm')).toBe(false);
    });

    it('generates an SVG for a 12-digit numeric input by appending checksum', () => {
        const svg = generateEan13Barcode('300000000000', 200, 80);
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
        expect(svg).toContain('<rect');
        expect(svg).toContain('3000000000007');
    });

    it('generates an SVG for a valid 13-digit input', () => {
        const svg = generateEan13Barcode('3000000000007', 200, 80);
        expect(svg).toContain('<svg');
        expect(svg).toContain('<rect');
        expect(svg).toContain('3000000000007');
    });

    it('falls back to plain text for invalid non-numeric input', () => {
        const svg = generateEan13Barcode('not-a-code', 200, 80);
        expect(svg).toContain('<svg');
        expect(svg).toContain('not-a-code');
        expect(svg).not.toContain('<rect');
    });
});
