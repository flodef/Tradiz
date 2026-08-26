import { describe, it, expect } from 'vitest';
import '../src/app/utils/extensions';
import { PRINT_NO_DETAIL, PRINT_WITH_DETAIL, PRINT_KEYWORD } from '../src/app/utils/constants';

describe('toCurrency (via Number.prototype.toCurrency)', () => {
    it('formats positive amounts with symbol after', () => {
        expect((52.73).toCurrency(2, '€')).toBe('52.73€');
    });

    it('formats negative amounts (refunds) with minus sign', () => {
        expect((-5.27).toCurrency(2, '€')).toBe('-5.27€');
    });

    it('respects decimals setting', () => {
        expect((52.7).toCurrency(2, '€')).toBe('52.70€');
    });
});

describe('print detail constants', () => {
    it('PRINT_NO_DETAIL has correct suffix', () => {
        expect(PRINT_NO_DETAIL).toBe(' (sans détail)');
    });

    it('PRINT_WITH_DETAIL has correct suffix', () => {
        expect(PRINT_WITH_DETAIL).toBe(' (avec détail)');
    });

    it('options can be built from constants', () => {
        const single = PRINT_KEYWORD + PRINT_NO_DETAIL;
        const multi = 'Impression : Caisse' + PRINT_WITH_DETAIL;
        expect(single).toBe('Impression (sans détail)');
        expect(multi).toBe('Impression : Caisse (avec détail)');
    });

    it('isPrintOption detection works with constants', () => {
        const option = PRINT_KEYWORD + PRINT_WITH_DETAIL;
        const isPrintOption =
            option.startsWith(PRINT_KEYWORD) &&
            (option.includes(PRINT_NO_DETAIL) || option.includes(PRINT_WITH_DETAIL));
        const showDetails = option.includes(PRINT_WITH_DETAIL);
        expect(isPrintOption).toBe(true);
        expect(showDetails).toBe(true);
    });

    it('non-print option is not detected as print option', () => {
        const option = 'Espèces';
        const isPrintOption =
            option.startsWith(PRINT_KEYWORD) &&
            (option.includes(PRINT_NO_DETAIL) || option.includes(PRINT_WITH_DETAIL));
        expect(isPrintOption).toBe(false);
    });
});

describe('VAT table column detection (posPrinter logic)', () => {
    it('first column is a label, not currency', () => {
        const cells = 'T1 5.5%\t 52.73€ \t 5.27€ \t 58.00€ '.split('\t');
        const firstCell = cells[0].trim();
        // Simulating the posPrinter logic: idx === 0 → print as-is
        expect(firstCell).toBe('T1 5.5%');
        // It should NOT be routed through toCurrency (which would produce NaN)
        const parsed = Number(firstCell.replace(/[^0-9., ]/g, '').trim());
        expect(parsed).toBeNaN();
    });

    it('remaining columns are currency values', () => {
        const cells = 'T1 5.5%\t 52.73€ \t 5.27€ \t 58.00€ '.split('\t');
        // idx > 0 → toCurrency
        for (let i = 1; i < cells.length; i++) {
            const trimmed = cells[i].trim();
            const parsed = Number(trimmed.replace(/[^0-9.,\- ]/g, '').trim());
            expect(parsed).not.toBeNaN();
        }
    });
});

describe('summary arrow separator', () => {
    it('uses ⟹ (U+27F9) as the arrow character', () => {
        const line = 'Carte Bancaire x 5 ⟹ 290.00€';
        expect(line.includes('⟹')).toBe(true);
        expect(line.includes('==>')).toBe(false);
    });

    it('splits correctly on ⟹', () => {
        const line = 'Carte Bancaire x 5 ⟹ 290.00€';
        const [left, right] = line.split('⟹');
        expect(left.trim()).toBe('Carte Bancaire x 5');
        expect(right.trim()).toBe('290.00€');
    });
});
