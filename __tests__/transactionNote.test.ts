import { encodeCashNote, parseCashNote } from '@/app/utils/transactionNote';
import { describe, it, expect } from 'vitest';

describe('transactionNote', () => {
    it('round-trips cashAmount and change', () => {
        const note = encodeCashNote(20, 4.5);
        expect(parseCashNote(note)).toEqual({ cashAmount: 20, change: 4.5 });
    });

    it('encodes cashAmount without change', () => {
        const note = encodeCashNote(10);
        expect(parseCashNote(note)).toEqual({ cashAmount: 10, change: undefined });
    });

    it('encodes zero cashAmount and zero change', () => {
        const note = encodeCashNote(0, 0);
        expect(parseCashNote(note)).toEqual({ cashAmount: 0, change: 0 });
    });

    it('returns empty string when cashAmount is not a number', () => {
        expect(encodeCashNote(undefined, 5)).toBe('');
        expect(encodeCashNote(NaN)).toBe('');
    });

    it('returns empty object for empty or missing notes', () => {
        expect(parseCashNote('')).toEqual({});
        expect(parseCashNote(null)).toEqual({});
        expect(parseCashNote(undefined)).toEqual({});
    });

    it('ignores legacy plain-text notes', () => {
        expect(parseCashNote('Table 4 - sans oignons')).toEqual({});
    });

    it('ignores JSON without a numeric cashAmount', () => {
        expect(parseCashNote(JSON.stringify({ change: 3 }))).toEqual({});
        expect(parseCashNote(JSON.stringify({ cashAmount: 'x' }))).toEqual({});
    });
});
