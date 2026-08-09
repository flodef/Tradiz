/**
 * Color name → CSS color mapping.
 *
 * The POS grid stores colors as French labels (e.g. "Rouge", "Vert clair").
 * This module converts them to CSS-compatible hex values so components can
 * use them directly via `style={{ backgroundColor }}`.
 *
 * English names are used as the canonical keys in the database; French names
 * are still accepted for backward compatibility with older data.
 */

// Canonical English color name → hex value
const COLOR_MAP: Record<string, string> = {
    white: '#ffffff',
    'light blue': '#7dd3fc',
    'light yellow': '#fde68a',
    'light orange': '#fdba74',
    'light pink': '#fbcfe8',
    red: '#ef4444',
    'light green': '#86efac',
    purple: '#a78bfa',
};

// French → English alias map (for backward compatibility with old data)
const FR_TO_EN: Record<string, string> = {
    blanc: 'white',
    'bleu clair': 'light blue',
    'jaune clair': 'light yellow',
    'orange clair': 'light orange',
    'rose clair': 'light pink',
    rouge: 'red',
    'vert clair': 'light green',
    violet: 'purple',
};

/**
 * Normalise a color string to its canonical English key.
 * Returns the input lowercased if no mapping is found.
 */
export function normalizeColorName(color: string | null | undefined): string {
    if (!color) return '';
    const lower = color.trim().toLowerCase();
    if (FR_TO_EN[lower]) return FR_TO_EN[lower];
    return lower;
}

/**
 * Convert a color name (English or French) to a CSS hex value.
 * Returns '' for unknown/empty colors so callers can fall back to default styling.
 */
export function colorToHex(color: string | null | undefined): string {
    if (!color) return '';
    const key = normalizeColorName(color);
    return COLOR_MAP[key] ?? '';
}

/**
 * Returns true when the color name maps to a known hex value.
 */
export function isKnownColor(color: string | null | undefined): boolean {
    if (!color) return false;
    return colorToHex(color) !== '';
}

/**
 * Returns the best contrast text color ('#000' or '#fff') for a given hex background.
 * Uses the W3C relative luminance formula.
 */
export function getContrastTextColor(hex: string): string {
    if (!hex) return '';
    const m = hex.replace('#', '');
    if (m.length !== 6) return '';
    const r = parseInt(m.slice(0, 2), 16) / 255;
    const g = parseInt(m.slice(2, 4), 16) / 255;
    const b = parseInt(m.slice(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.179 ? '#000000' : '#ffffff';
}
