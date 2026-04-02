import '@/app/utils/extensions';
import { describe, it, expect } from 'vitest';

/**
 * Currency label normalization tests.
 *
 * Tests the String.prototype.normalizeCurrency() extension method.
 *
 * Problem: Currency labels can appear in different formats:
 * - From DB/API: "Euro (€)", "Dollar ($)"
 * - From spreadsheet: "Euro", "Dollar", "euro" (lowercase)
 * - User input: "Euro (€)", "Euro"
 *
 * The normalization function:
 * 1. Strips trailing parenthetical content (e.g., symbol)
 * 2. Normalizes to first letter uppercase for case-insensitive matching
 */

describe('Currency label normalization', () => {
    describe('Basic normalization', () => {
        it('strips trailing parenthetical symbol', () => {
            expect('Euro (€)'.normalizeCurrency()).toBe('Euro');
        });

        it('strips trailing parenthetical with dollar sign', () => {
            expect('Dollar ($)'.normalizeCurrency()).toBe('Dollar');
        });

        it('leaves label without parentheses unchanged', () => {
            expect('Euro'.normalizeCurrency()).toBe('Euro');
        });

        it('handles empty string', () => {
            expect(''.normalizeCurrency()).toBe('');
        });

        it('trims whitespace', () => {
            expect('  Euro (€)  '.normalizeCurrency()).toBe('Euro');
        });

        it('handles whitespace before parenthesis', () => {
            expect('Euro  (€)'.normalizeCurrency()).toBe('Euro');
        });

        it('normalizes to first letter uppercase', () => {
            expect('euro'.normalizeCurrency()).toBe('Euro');
        });

        it('normalizes lowercase with symbol to first letter uppercase', () => {
            expect('euro (€)'.normalizeCurrency()).toBe('Euro');
        });

        it('handles all uppercase', () => {
            expect('EURO'.normalizeCurrency()).toBe('EURO');
        });

        it('handles mixed case', () => {
            expect('eUrO'.normalizeCurrency()).toBe('EUrO');
        });
    });

    describe('Edge cases', () => {
        it('preserves parentheses in the middle of the label', () => {
            expect('Dollar (US) (USD)'.normalizeCurrency()).toBe('Dollar (US)');
        });

        it('only strips the last parenthetical group', () => {
            expect('Pound (UK) (£)'.normalizeCurrency()).toBe('Pound (UK)');
        });

        it('handles multiple symbols in parentheses', () => {
            expect('Euro (€/EUR)'.normalizeCurrency()).toBe('Euro');
        });

        it('handles empty parentheses', () => {
            expect('Currency ()'.normalizeCurrency()).toBe('Currency');
        });

        it('handles unclosed opening paren (no closing paren after last opening)', () => {
            // If last '(' has no matching ')', keep the original
            expect('Test ('.normalizeCurrency()).toBe('Test (');
        });

        it('handles label that is only parentheses', () => {
            expect('(€)'.normalizeCurrency()).toBe('');
        });

        it('normalizes case for labels with multiple parenthetical groups', () => {
            expect('dollar (US) (USD)'.normalizeCurrency()).toBe('Dollar (US)');
        });

        it('handles lowercase with whitespace and symbol', () => {
            expect('  euro (€)  '.normalizeCurrency()).toBe('Euro');
        });
    });

    describe('Real-world matching scenarios', () => {
        const allCurrencies = [
            { label: 'Euro (€)', symbol: '€', maxValue: 999.99, decimals: 2 },
            { label: 'Dollar ($)', symbol: '$', maxValue: 999.99, decimals: 2 },
            { label: 'Pound (£)', symbol: '£', maxValue: 999.99, decimals: 2 },
        ];

        it('matches "Euro" from spreadsheet to "Euro (€)" from DB', () => {
            const spreadsheetLabel = 'Euro';
            const match = allCurrencies.find(
                (c) => c.label.normalizeCurrency() === spreadsheetLabel.normalizeCurrency()
            );
            expect(match).toBeDefined();
            expect(match?.symbol).toBe('€');
        });

        it('matches "Euro (€)" from spreadsheet to "Euro (€)" from DB', () => {
            const spreadsheetLabel = 'Euro (€)';
            const match = allCurrencies.find(
                (c) => c.label.normalizeCurrency() === spreadsheetLabel.normalizeCurrency()
            );
            expect(match).toBeDefined();
            expect(match?.symbol).toBe('€');
        });

        it('matches "Dollar" to "Dollar ($)"', () => {
            const spreadsheetLabel = 'Dollar';
            const match = allCurrencies.find(
                (c) => c.label.normalizeCurrency() === spreadsheetLabel.normalizeCurrency()
            );
            expect(match).toBeDefined();
            expect(match?.symbol).toBe('$');
        });

        it('does not match different currencies', () => {
            const spreadsheetLabel = 'Yen';
            const match = allCurrencies.find(
                (c) => c.label.normalizeCurrency() === spreadsheetLabel.normalizeCurrency()
            );
            expect(match).toBeUndefined();
        });

        it('handles case-sensitive matching (Euro vs euro)', () => {
            const spreadsheetLabel = 'euro';
            const match = allCurrencies.find(
                (c) => c.label.normalizeCurrency() === spreadsheetLabel.normalizeCurrency()
            );
            expect(match).toBeDefined();
            expect(match?.symbol).toBe('€');
        });
    });

    describe('Comparison with split approach', () => {
        // Your original approach: split('(')[0].trim()
        const splitApproach = (label: string) => label.split('(')[0].trim();

        it('both approaches handle basic case', () => {
            const label = 'Euro (€)';
            expect(label.normalizeCurrency()).toBe(splitApproach(label));
        });

        it('regex handles nested parentheses better', () => {
            const label = 'Dollar (US) (USD)';
            expect(label.normalizeCurrency()).toBe('Dollar (US)');
            expect(splitApproach(label)).toBe('Dollar'); // Loses "(US)"
        });

        it('both handle no parentheses', () => {
            const label = 'Euro';
            expect(label.normalizeCurrency()).toBe(splitApproach(label));
        });
    });
});
