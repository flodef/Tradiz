import { describe, it, expect } from 'vitest';

/**
 * Non-regression tests for currency fetching and mapping.
 *
 * Bug: getCurrencies always returned hardcoded JSON, ignoring the DB `currency` table.
 *      Also validates that the values[][] shape and column ordering is correct so that
 *      convertCurrenciesData maps them properly to the Currency interface.
 *
 * DB table: currency { id, label, symbol, max_value, decimals }
 * Expected values[][] shape: [header, ...rows] where each row = [label, maxValue, symbol, decimals]
 * Currency interface: { label, maxValue, symbol, decimals }
 */

interface CurrencyRow {
    label: string;
    symbol: string;
    max_value: number | null;
    decimals: number | null;
}

interface Currency {
    label: string;
    maxValue: number;
    symbol: string;
    decimals: number;
}

// Replicates the mapping logic from getCurrencies/route.ts
function buildCurrencyValues(rows: CurrencyRow[]): (string | number)[][] {
    return [
        ['Intitulé (Symbole)', 'Valeur maximale', 'Symbole', 'Décimales'],
        ...rows.map((row) => [row.label, row.max_value ?? 999.99, row.symbol, row.decimals ?? 2]),
    ];
}

// Replicates convertCurrenciesData logic from processData.ts
function convertCurrenciesValues(values: (string | number)[][]): Currency[] {
    return values.slice(1).map((item) => ({
        label: String(item[0]),
        maxValue: Number(item[1]),
        symbol: String(item[2]),
        decimals: Number(item[3]),
    }));
}

// Full pipeline: DB rows → values[][] → Currency[]
function dbRowsToCurrencies(rows: CurrencyRow[]): Currency[] {
    return convertCurrenciesValues(buildCurrencyValues(rows));
}

// ── Column mapping ─────────────────────────────────────────────────────────────

describe('getCurrencies: values[][] column ordering', () => {
    const rows: CurrencyRow[] = [{ label: 'Euro', symbol: '€', max_value: 999.99, decimals: 2 }];

    it('header row has 4 columns', () => {
        const values = buildCurrencyValues(rows);
        expect(values[0]).toHaveLength(4);
    });

    it('data row has 4 columns', () => {
        const values = buildCurrencyValues(rows);
        expect(values[1]).toHaveLength(4);
    });

    it('column 0 is label', () => {
        const values = buildCurrencyValues(rows);
        expect(values[1][0]).toBe('Euro');
    });

    it('column 1 is maxValue (max_value from DB)', () => {
        const values = buildCurrencyValues(rows);
        expect(values[1][1]).toBe(999.99);
    });

    it('column 2 is symbol', () => {
        const values = buildCurrencyValues(rows);
        expect(values[1][2]).toBe('€');
    });

    it('column 3 is decimals', () => {
        const values = buildCurrencyValues(rows);
        expect(values[1][3]).toBe(2);
    });
});

// ── Null / missing value defaults ──────────────────────────────────────────────

describe('getCurrencies: null DB values use sensible defaults', () => {
    it('null max_value defaults to 999.99', () => {
        const [result] = dbRowsToCurrencies([{ label: 'Test', symbol: 'T', max_value: null, decimals: 2 }]);
        expect(result.maxValue).toBe(999.99);
    });

    it('null decimals defaults to 2', () => {
        const [result] = dbRowsToCurrencies([{ label: 'Test', symbol: 'T', max_value: 100, decimals: null }]);
        expect(result.decimals).toBe(2);
    });

    it('both null fields use defaults', () => {
        const [result] = dbRowsToCurrencies([{ label: 'Test', symbol: 'T', max_value: null, decimals: null }]);
        expect(result.maxValue).toBe(999.99);
        expect(result.decimals).toBe(2);
    });
});

// ── Full pipeline DB → Currency[] ─────────────────────────────────────────────

describe('getCurrencies: full DB → Currency[] pipeline', () => {
    const dbRows: CurrencyRow[] = [
        { label: 'Euro', symbol: '€', max_value: 999.99, decimals: 2 },
        { label: 'Bitcoin', symbol: '₿', max_value: 0.01, decimals: 8 },
    ];

    it('returns one Currency per DB row', () => {
        expect(dbRowsToCurrencies(dbRows)).toHaveLength(2);
    });

    it('header row is not included in output', () => {
        const result = dbRowsToCurrencies(dbRows);
        expect(result.every((c) => typeof c.label === 'string')).toBe(true);
        expect(result.find((c) => c.label === 'Intitulé (Symbole)')).toBeUndefined();
    });

    it('maps Euro row correctly', () => {
        const [euro] = dbRowsToCurrencies(dbRows);
        expect(euro).toEqual({ label: 'Euro', maxValue: 999.99, symbol: '€', decimals: 2 });
    });

    it('maps Bitcoin row correctly', () => {
        const [, btc] = dbRowsToCurrencies(dbRows);
        expect(btc).toEqual({ label: 'Bitcoin', maxValue: 0.01, symbol: '₿', decimals: 8 });
    });

    it('empty DB rows returns empty array', () => {
        expect(dbRowsToCurrencies([])).toHaveLength(0);
    });
});

// ── Payment method currency field ─────────────────────────────────────────────

describe('payment method currency: symbol is used as currency identifier', () => {
    it('Euro symbol is €', () => {
        const [euro] = dbRowsToCurrencies([{ label: 'Euro', symbol: '€', max_value: 999.99, decimals: 2 }]);
        expect(euro.symbol).toBe('€');
    });

    it('currency with 0 decimals has step of 1', () => {
        const [result] = dbRowsToCurrencies([{ label: 'Points', symbol: 'pts', max_value: 9999, decimals: 0 }]);
        const step = result.decimals > 0 ? Math.pow(10, -result.decimals) : 1;
        expect(step).toBe(1);
    });

    it('currency with 2 decimals has step of 0.01', () => {
        const [result] = dbRowsToCurrencies([{ label: 'Euro', symbol: '€', max_value: 999.99, decimals: 2 }]);
        const step = result.decimals > 0 ? Math.pow(10, -result.decimals) : 1;
        expect(step).toBe(0.01);
    });
});
