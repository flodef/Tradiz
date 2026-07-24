/**
 * Generate a simple EAN-13 barcode as an SVG string.
 * Returns an empty SVG when the value cannot be represented as EAN-13.
 */

// EAN-13 digit patterns (A = left odd, B = left even, C = right).
const EAN13_SETS: Record<'A' | 'B' | 'C', string[]> = {
    A: ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'],
    B: ['0100111', '0110011', '0011011', '0100001', '0011101', '0101111', '0111011', '0110001', '0001001', '0010001'],
    C: ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'],
};

// Parity pattern for the first digit (A=0, B=1). Index = first digit.
const FIRST_DIGIT_PARITY: string[] = [
    'AAAAAA',
    'AABABB',
    'AABBAB',
    'AABBBA',
    'ABAABB',
    'ABBABB',
    'ABBBBA',
    'ABABAB',
    'ABABBA',
    'ABBABA',
];

const GUARDS = {
    left: '101',
    center: '01010',
    right: '101',
};

export function validateEan13(value: string): boolean {
    if (!/^\d{13}$/.test(value)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(value[i], 10);
        sum += digit * ((i + 1) % 2 === 0 ? 3 : 1);
    }
    const checksum = (10 - (sum % 10)) % 10;
    return checksum === parseInt(value[12], 10);
}

export function computeEan13Checksum(value: string): string {
    const digits = value.replace(/\D/g, '').padStart(12, '0').slice(0, 12);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(digits[i], 10);
        sum += digit * ((i + 1) % 2 === 0 ? 3 : 1);
    }
    const checksum = (10 - (sum % 10)) % 10;
    return digits + checksum;
}

function encodeEan13(value: string): string | null {
    if (!validateEan13(value)) return null;

    const firstDigit = parseInt(value[0], 10);
    const parity = FIRST_DIGIT_PARITY[firstDigit];
    if (!parity) return null;

    const leftDigits = value.slice(1, 7);
    const rightDigits = value.slice(7, 13);

    let pattern = GUARDS.left;
    for (let i = 0; i < 6; i++) {
        const set = parity[i] as 'A' | 'B';
        const digit = parseInt(leftDigits[i], 10);
        pattern += EAN13_SETS[set][digit];
    }
    pattern += GUARDS.center;
    for (let i = 0; i < 6; i++) {
        const digit = parseInt(rightDigits[i], 10);
        pattern += EAN13_SETS.C[digit];
    }
    pattern += GUARDS.right;

    return pattern;
}

/**
 * Render an EAN-13 barcode as a self-contained SVG string.
 * @param value 13-digit EAN-13 string. A 12-digit numeric string will have its
 *              checksum computed automatically; otherwise the value must already be valid.
 * @param width Total SVG width in pixels.
 * @param height Total SVG height in pixels.
 */
export function generateEan13Barcode(value: string, width = 200, height = 100): string {
    const sanitized = value.replace(/\D/g, '');
    const ean13 = sanitized.length === 12 ? computeEan13Checksum(sanitized) : sanitized;

    const pattern = encodeEan13(ean13);
    if (!pattern) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="12">${value}</text></svg>`;
    }

    const quietZone = 9;
    const totalModules = quietZone * 2 + pattern.length;
    const moduleWidth = width / totalModules;
    const barHeight = height * 0.78;
    const textY = height - 4;

    let bars = '';
    let x = quietZone * moduleWidth;
    for (const bit of pattern) {
        if (bit === '1') {
            bars += `<rect x="${x.toFixed(2)}" y="0" width="${moduleWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="black"/>`;
        }
        x += moduleWidth;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block">
        ${bars}
        <text x="${(width / 2).toFixed(2)}" y="${textY.toFixed(2)}" text-anchor="middle" font-size="${Math.max(10, moduleWidth * 10).toFixed(1)}" font-family="monospace">${ean13}</text>
    </svg>`;
}
