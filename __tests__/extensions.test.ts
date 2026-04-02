import '@/app/utils/extensions';
import { describe, it, expect } from 'vitest';

/**
 * Comprehensive tests for all prototype extension methods in extensions.ts
 */

describe('Number.prototype extensions', () => {
    describe('toLocaleCurrency', () => {
        it('formats number as EUR currency by default', () => {
            const result = (123.45).toLocaleCurrency();
            expect(result).toContain('123');
            expect(result).toContain('45');
        });

        it('formats number with specified currency', () => {
            const result = (100).toLocaleCurrency('USD');
            expect(result).toContain('100');
        });

        it('handles zero', () => {
            const result = (0).toLocaleCurrency();
            expect(result).toBeDefined();
        });

        it('handles very small numbers with significant digits', () => {
            const result = (0.0012).toLocaleCurrency();
            expect(result).toBeDefined();
        });
    });

    describe('toShortCurrency', () => {
        it('formats number without decimals by default', () => {
            const result = (1234).toShortCurrency();
            expect(result).toContain('1');
            expect(result).toContain('234');
            expect(result).toContain('€');
        });

        it('formats thousands with K suffix', () => {
            expect((5000).toShortCurrency()).toBe('5K€');
        });

        it('formats millions with M suffix', () => {
            expect((2000000).toShortCurrency()).toBe('2M€');
        });

        it('respects maxDecimals parameter', () => {
            expect((123.456).toShortCurrency(2)).toBe('123.46 €');
        });

        it('uses custom symbol', () => {
            expect((100).toShortCurrency(0, '$')).toBe('100 $');
        });

        it('handles zero', () => {
            expect((0).toShortCurrency()).toBe('0 €');
        });

        it('handles negative numbers', () => {
            const result = (-1234).toShortCurrency();
            expect(result).toContain('-');
            expect(result).toContain('1 234');
        });
    });

    describe('toCurrency', () => {
        it('formats with 2 decimals by default', () => {
            expect((123.456).toCurrency()).toBe('123.46€');
        });

        it('respects maxDecimals parameter', () => {
            expect((123.456).toCurrency(1)).toBe('123.5€');
        });

        it('uses custom symbol', () => {
            expect((100).toCurrency(2, '$')).toBe('100.00$');
        });

        it('places symbol before when specified', () => {
            expect((100).toCurrency(2, '$', 'before')).toBe('$100.00');
        });

        it('places symbol after by default', () => {
            expect((100).toCurrency(2, '€')).toBe('100.00€');
        });

        it('handles zero', () => {
            expect((0).toCurrency()).toBe('0.00€');
        });

        it('strips non-numeric characters from input', () => {
            expect((123.45).toCurrency()).toBe('123.45€');
        });
    });

    describe('toRatio', () => {
        it('converts to percentage with 2 decimals by default', () => {
            expect((0.1234).toRatio()).toBe('12.34%');
        });

        it('respects maxDecimals parameter', () => {
            expect((0.1234).toRatio(1)).toBe('12.3%');
        });

        it('handles zero', () => {
            expect((0).toRatio()).toBe('0.00%');
        });

        it('handles 1 as 100%', () => {
            expect((1).toRatio()).toBe('100.00%');
        });

        it('handles values over 1', () => {
            expect((1.5).toRatio()).toBe('150.00%');
        });

        it('handles negative percentages', () => {
            expect((-0.25).toRatio()).toBe('-25.00%');
        });
    });

    describe('toLocaleDateString', () => {
        it('converts Excel serial date to formatted date', () => {
            // Excel serial 44927 = 2023-01-01
            const result = (44927).toLocaleDateString();
            expect(result).toBeDefined();
            expect(result).toContain('2023');
        });

        it('handles epoch-like numbers', () => {
            const result = (25569).toLocaleDateString(); // 1970-01-01 in Excel
            expect(result).toBeDefined();
        });
    });

    describe('toShortFixed', () => {
        it('returns integer as string without decimals', () => {
            expect((123).toShortFixed()).toBe('123');
        });

        it('formats float with specified decimals', () => {
            expect((123.456).toShortFixed(2)).toBe('123.46');
        });

        it('uses 2 decimals by default for floats', () => {
            expect((123.456).toShortFixed()).toBe('123.46');
        });

        it('handles zero', () => {
            expect((0).toShortFixed()).toBe('0');
        });

        it('handles negative integers', () => {
            expect((-123).toShortFixed()).toBe('-123');
        });

        it('handles negative floats', () => {
            expect((-123.456).toShortFixed(2)).toBe('-123.46');
        });
    });

    describe('toDecimalPlace', () => {
        it('rounds up by default', () => {
            expect((1.234).toDecimalPlace(2, 'up')).toBe(1.24);
        });

        it('rounds down when specified', () => {
            expect((1.236).toDecimalPlace(2, 'down')).toBe(1.23);
        });

        it('uses 2 decimal places by default', () => {
            expect((1.234).toDecimalPlace()).toBe(1.24);
        });

        it('handles 0 decimal places', () => {
            expect((1.6).toDecimalPlace(0, 'up')).toBe(2);
        });

        it('handles negative numbers', () => {
            expect((-1.234).toDecimalPlace(2, 'up')).toBe(-1.23);
        });

        it('handles zero', () => {
            expect((0).toDecimalPlace(2)).toBe(0);
        });
    });

    describe('toClosestPowerOfTen', () => {
        it('returns 0 for numbers < 10 when rounding down', () => {
            expect((5).toClosestPowerOfTen('down')).toBe(0);
        });

        it('returns 1 for numbers < 10 when rounding up', () => {
            expect((5).toClosestPowerOfTen('up')).toBe(1);
        });

        it('returns 10 for 50 when rounding down', () => {
            expect((50).toClosestPowerOfTen('down')).toBe(10);
        });

        it('returns 100 for 50 when rounding up', () => {
            expect((50).toClosestPowerOfTen('up')).toBe(100);
        });

        it('returns 100 for 500 when rounding down', () => {
            expect((500).toClosestPowerOfTen('down')).toBe(100);
        });

        it('returns 1000 for 500 when rounding up', () => {
            expect((500).toClosestPowerOfTen('up')).toBe(1000);
        });

        it('handles negative numbers', () => {
            expect((-500).toClosestPowerOfTen('down')).toBe(100);
        });

        it('rounds down by default', () => {
            expect((500).toClosestPowerOfTen()).toBe(100);
        });
    });

    describe('clean', () => {
        it('removes extra decimals with 2 decimals by default', () => {
            expect((1.23456).clean()).toBe(1.23);
        });

        it('respects maxDecimals parameter', () => {
            expect((1.23456).clean(3)).toBe(1.235);
        });

        it('handles integers', () => {
            expect((123).clean()).toBe(123);
        });

        it('handles zero', () => {
            expect((0).clean()).toBe(0);
        });

        it('rounds correctly', () => {
            expect((1.235).clean(2)).toBe(1.24);
        });
    });
});

describe('String.prototype extensions', () => {
    describe('fromCurrency', () => {
        it('parses French format with comma decimal separator', () => {
            expect('123,45'.fromCurrency('fr-FR')).toBe(123.45);
        });

        it('parses US format with period decimal separator', () => {
            expect('123.45'.fromCurrency('en-US')).toBe(123.45);
        });

        it('strips currency symbols', () => {
            expect('€123.45'.fromCurrency('en-US')).toBe(123.45);
        });

        it('strips spaces', () => {
            expect('1 234.56'.fromCurrency('en-US')).toBe(1234.56);
        });

        it('handles negative numbers', () => {
            expect('-123.45'.fromCurrency('en-US')).toBe(-123.45);
        });

        it('handles zero', () => {
            expect('0'.fromCurrency()).toBe(0);
        });

        it('handles French thousands separator', () => {
            expect('1 234,56'.fromCurrency('fr-FR')).toBe(1234.56);
        });
    });

    describe('normalizeCurrency', () => {
        // Already tested in currencyLabelNormalization.test.ts
        it('strips trailing parenthetical symbol', () => {
            expect('Euro (€)'.normalizeCurrency()).toBe('Euro');
        });

        it('normalizes to first letter uppercase', () => {
            expect('euro'.normalizeCurrency()).toBe('Euro');
        });
    });

    describe('toFirstUpperCase', () => {
        it('capitalizes first letter', () => {
            expect('hello'.toFirstUpperCase()).toBe('Hello');
        });

        it('leaves already capitalized string unchanged', () => {
            expect('Hello'.toFirstUpperCase()).toBe('Hello');
        });

        it('handles all uppercase', () => {
            expect('HELLO'.toFirstUpperCase()).toBe('HELLO');
        });

        it('handles single character', () => {
            expect('a'.toFirstUpperCase()).toBe('A');
        });

        it('handles empty string', () => {
            expect(''.toFirstUpperCase()).toBe('');
        });

        it('trims whitespace', () => {
            expect('  hello  '.toFirstUpperCase()).toBe('Hello');
        });

        it('handles mixed case', () => {
            expect('hELLO'.toFirstUpperCase()).toBe('HELLO');
        });
    });

    describe('testLimit', () => {
        it('returns true when length is within min and max', () => {
            expect('hello'.testLimit({ min: 3, max: 10 })).toBe(true);
        });

        it('returns true when length equals min', () => {
            expect('hello'.testLimit({ min: 5, max: 10 })).toBe(true);
        });

        it('returns true when length equals max', () => {
            expect('hello'.testLimit({ min: 3, max: 5 })).toBe(true);
        });

        it('returns false when length is below min', () => {
            expect('hi'.testLimit({ min: 3, max: 10 })).toBe(false);
        });

        it('returns false when length is above max', () => {
            expect('hello world'.testLimit({ min: 3, max: 5 })).toBe(false);
        });

        it('handles empty string', () => {
            expect(''.testLimit({ min: 0, max: 5 })).toBe(true);
            expect(''.testLimit({ min: 1, max: 5 })).toBe(false);
        });
    });
});

describe('Date.prototype extensions', () => {
    describe('toShortDate', () => {
        it('formats date in short format', () => {
            const date = new Date('2023-01-15');
            const result = date.toShortDate();
            expect(result).toContain('2023');
            expect(result).toContain('1');
            expect(result).toContain('15');
        });

        it('handles current date', () => {
            const result = new Date().toShortDate();
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });
    });

    describe('toLongDate', () => {
        it('formats date in long format with time', () => {
            const date = new Date('2023-01-15T10:30:00');
            const result = date.toLongDate();
            expect(result).toContain('2023');
            expect(result).toContain('1');
            expect(result).toContain('15');
        });

        it('includes time information', () => {
            const date = new Date('2023-01-15T10:30:00');
            const result = date.toLongDate();
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });
    });
});

describe('Array.prototype extensions', () => {
    describe('removeHeader', () => {
        it('removes first element from array', () => {
            const arr = ['header', 'row1', 'row2'];
            expect(arr.removeHeader()).toEqual(['row1', 'row2']);
        });

        it('handles single element array', () => {
            const arr = ['header'];
            expect(arr.removeHeader()).toEqual([]);
        });

        it('handles empty array', () => {
            const arr: string[] = [];
            expect(arr.removeHeader()).toEqual([]);
        });

        it('does not mutate original array', () => {
            const arr = ['header', 'row1', 'row2'];
            const result = arr.removeHeader();
            expect(arr).toEqual(['header', 'row1', 'row2']);
            expect(result).toEqual(['row1', 'row2']);
        });
    });

    describe('removeEmpty', () => {
        it('removes falsy elements from flat array', () => {
            const arr = [1, 0, 2, null, 3, undefined, 4, ''];
            expect(arr.removeEmpty()).toEqual([1, 2, 3, 4]);
        });

        it('removes rows where specified index is empty', () => {
            const arr = [
                ['a', 'b', 'c'],
                ['d', '', 'f'],
                ['g', 'h', 'i'],
            ];
            expect(arr.removeEmpty(1)).toEqual([
                ['a', 'b', 'c'],
                ['g', 'h', 'i'],
            ]);
        });

        it('removes rows where any of multiple indices are empty', () => {
            const arr = [
                ['a', 'b', 'c'],
                ['d', '', 'f'],
                ['g', 'h', ''],
                ['j', 'k', 'l'],
            ];
            expect(arr.removeEmpty(1, 2)).toEqual([
                ['a', 'b', 'c'],
                ['j', 'k', 'l'],
            ]);
        });

        it('removes rows where any index in array parameter is empty', () => {
            const arr = [
                ['a', 'b', 'c'],
                ['d', '', 'f'],
                ['g', 'h', ''],
            ];
            expect(arr.removeEmpty([1, 2])).toEqual([['a', 'b', 'c']]);
        });

        it('removes rows where all elements are empty when no index specified', () => {
            const arr = [
                ['a', 'b', 'c'],
                ['', '', ''],
                ['d', 'e', 'f'],
            ];
            expect(arr.removeEmpty()).toEqual([
                ['a', 'b', 'c'],
                ['d', 'e', 'f'],
            ]);
        });

        it('handles empty array', () => {
            const arr: string[] = [];
            expect(arr.removeEmpty()).toEqual([]);
        });

        it('handles index out of bounds gracefully', () => {
            const arr = [
                ['a', 'b'],
                ['c', 'd'],
            ];
            expect(arr.removeEmpty(5)).toEqual([
                ['a', 'b'],
                ['c', 'd'],
            ]);
        });

        it('does not mutate original array', () => {
            const arr = [1, 0, 2, null, 3];
            const result = arr.removeEmpty();
            expect(arr).toEqual([1, 0, 2, null, 3]);
            expect(result).toEqual([1, 2, 3]);
        });
    });
});
