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

    it('renders real bars for a short numeric reference by left-padding to 12 digits', () => {
        // Regression: short references used to fall back to plain text, so the
        // report showed the raw number instead of a scannable barcode.
        const svg = generateEan13Barcode('12345', 200, 80);
        expect(svg).toContain('<rect');
        expect(svg).toContain(computeEan13Checksum('000000012345'));
    });

    it('ignores non-digit separators when building the barcode', () => {
        expect(generateEan13Barcode('300-000-000-000')).toBe(generateEan13Barcode('300000000000'));
    });

    it('escapes the fallback text so the SVG cannot be broken out of', () => {
        const svg = generateEan13Barcode('<script>alert("x")</script>');
        expect(svg).not.toContain('<script>');
        expect(svg).toContain('&lt;script&gt;');
    });

    it('encodes set B (even-parity) digits 5/6/7/9 correctly', () => {
        // First digit 5 => parity ABBABB, so left digits at positions 2,3,5,6
        // are encoded with set B. This value places 5,6,7,9 in those positions,
        // exercising the G-codes that must equal the bit-reverse of the C-codes.
        const value = '5056079000002';
        expect(validateEan13(value)).toBe(true);

        const svg = generateEan13Barcode(value);
        const rectCount = (svg.match(/<rect/g) || []).length;
        // 6 guard modules + 18 left black modules + 24 right black modules.
        expect(rectCount).toBe(48);
    });
});
