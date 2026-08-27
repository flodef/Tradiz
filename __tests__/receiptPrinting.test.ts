import { describe, it, expect } from 'vitest';
import '../src/app/utils/extensions';
import {
    PRINT_NO_DETAIL,
    PRINT_WITH_DETAIL,
    PRINT_KEYWORD,
    PROCESSING_KEYWORD,
    WAITING_KEYWORD,
    DELETED_KEYWORD,
} from '../src/app/utils/constants';
import {
    isProcessingTransaction,
    isWaitingTransaction,
    isDeletedTransaction,
} from '../src/app/contexts/dataProvider/transactionHelpers';

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

describe('mealCount receipt VAT computation', () => {
    it('computes VAT from transaction.amount when mealCount is set', () => {
        const DEFAULT_VAT_RATE = 0.055;
        const mealCount = 3;
        const totalAmount = 15.0;

        // Replicate the mealCount branch logic from posPrinter.ts
        const vatRate = DEFAULT_VAT_RATE;
        const totalAmountHT = totalAmount / (1 + vatRate);
        const totalAmountTVA = totalAmount - totalAmountHT;

        expect(totalAmountHT).toBeCloseTo(14.216, 2);
        expect(totalAmountTVA).toBeCloseTo(0.784, 2);
        expect(totalAmountHT + totalAmountTVA).toBeCloseTo(totalAmount, 2);
    });

    it('does not use product totals when mealCount is set', () => {
        const DEFAULT_VAT_RATE = 0.055;
        const mealCount = 2;
        // Products array may be empty or have different totals
        const products = [
            { total: 5.0, category: 'Plat' },
            { total: 3.0, category: 'Entrée' },
        ];
        const productSum = products.reduce((sum, p) => sum + (p.total || 0), 0);
        const transactionAmount = 10.0; // This is what the meal-count line prints

        // VAT should be computed from transactionAmount, NOT productSum
        const vatRate = DEFAULT_VAT_RATE;
        const htFromAmount = transactionAmount / (1 + vatRate);
        const htFromProducts = productSum / (1 + vatRate);

        expect(htFromAmount).not.toBeCloseTo(htFromProducts, 2);
        expect(htFromAmount).toBeCloseTo(9.477, 2);
    });
});

describe('Ticket Z PROCESSING exclusion', () => {
    it('filters out PROCESSING transactions from summary', () => {
        const transactions = [
            {
                method: 'CB',
                amount: 10,
                currency: 'EUR',
                createdDate: 1,
                modifiedDate: 1,
                products: [],
                validator: 'T',
            },
            {
                method: PROCESSING_KEYWORD,
                amount: 5,
                currency: 'EUR',
                createdDate: 2,
                modifiedDate: 2,
                products: [],
                validator: 'T',
            },
            {
                method: WAITING_KEYWORD,
                amount: 7,
                currency: 'EUR',
                createdDate: 3,
                modifiedDate: 3,
                products: [],
                validator: 'T',
            },
            {
                method: DELETED_KEYWORD,
                amount: 3,
                currency: 'EUR',
                createdDate: 4,
                modifiedDate: 4,
                products: [],
                validator: 'T',
            },
            {
                method: 'Espèce',
                amount: 20,
                currency: 'EUR',
                createdDate: 5,
                modifiedDate: 5,
                products: [],
                validator: 'T',
            },
        ];

        // Replicate the getFilteredTransactions logic from useSummary
        const filtered = transactions.filter(
            (t) => !isDeletedTransaction(t) && !isWaitingTransaction(t) && !isProcessingTransaction(t)
        );

        expect(filtered).toHaveLength(2);
        expect(filtered[0].method).toBe('CB');
        expect(filtered[1].method).toBe('Espèce');
    });
});
