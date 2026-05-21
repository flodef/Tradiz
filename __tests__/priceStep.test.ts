import { describe, expect, it } from 'vitest';
import { getPriceStepFromDecimals, getMainCurrencyStep } from '../src/app/utils/priceStep';

describe('getPriceStepFromDecimals', () => {
    it('returns 1 for 0 decimals', () => {
        expect(getPriceStepFromDecimals(0)).toBe(1);
    });

    it('returns 0.1 for 1 decimal', () => {
        expect(getPriceStepFromDecimals(1)).toBe(0.1);
    });

    it('returns 0.01 for 2 decimals', () => {
        expect(getPriceStepFromDecimals(2)).toBe(0.01);
    });

    it('returns 0.001 for 3 decimals', () => {
        expect(getPriceStepFromDecimals(3)).toBe(0.001);
    });

    it('returns 0.0001 for 4 decimals', () => {
        expect(getPriceStepFromDecimals(4)).toBe(0.0001);
    });

    it('handles negative decimals as 0', () => {
        expect(getPriceStepFromDecimals(-1)).toBe(1);
    });
});

describe('getMainCurrencyStep', () => {
    it('finds currency with rate = 1 and returns its step', () => {
        const currencies = [
            { rate: 1, decimals: 2, label: 'EUR' },
            { rate: 1.1, decimals: 0, label: 'USD' },
        ];
        expect(getMainCurrencyStep(currencies)).toBe(0.01);
    });

    it('falls back to first currency if no rate = 1 found', () => {
        const currencies = [
            { rate: 1.1, decimals: 3, label: 'USD' },
            { rate: 0.9, decimals: 0, label: 'GBP' },
        ];
        expect(getMainCurrencyStep(currencies)).toBe(0.001);
    });

    it('falls back to 2 decimals (0.01) if no currencies provided', () => {
        expect(getMainCurrencyStep([])).toBe(0.01);
    });

    it('calculates correct step for EUR with 2 decimals', () => {
        const currencies = [{ rate: 1, decimals: 2, label: 'EUR' }];
        expect(getMainCurrencyStep(currencies)).toBe(0.01);
    });

    it('calculates correct step for JPY with 0 decimals', () => {
        const currencies = [{ rate: 1, decimals: 0, label: 'JPY' }];
        expect(getMainCurrencyStep(currencies)).toBe(1);
    });

    it('calculates correct step for crypto with 8 decimals', () => {
        const currencies = [{ rate: 1, decimals: 8, label: 'BTC' }];
        expect(getMainCurrencyStep(currencies)).toBe(0.00000001);
    });
});
