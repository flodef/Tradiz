import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindList, dayBounds, shopLocalToday } from '@/app/api/sql/db';

afterEach(() => {
    vi.useRealTimers();
});

describe('bindList', () => {
    it('emits placeholders whose indices line up with the appended params (non-zero offset)', () => {
        const params: unknown[] = ['2026-09-17', '2026-09-18', 'ESPÈCES'];
        const sql = bindList(true, params, ['CB', 'CHÈQUE']);
        expect(sql).toBe('$4, $5');
        expect(params).toEqual(['2026-09-17', '2026-09-18', 'ESPÈCES', 'CB', 'CHÈQUE']);
        // Every emitted index must resolve to the value it binds.
        expect(params[4 - 1]).toBe('CB');
        expect(params[5 - 1]).toBe('CHÈQUE');
    });

    it('starts at $1 on an empty params array and uses ? for MariaDB', () => {
        const pgParams: unknown[] = [];
        expect(bindList(true, pgParams, ['a', 'b'])).toBe('$1, $2');
        expect(pgParams).toEqual(['a', 'b']);

        const myParams: unknown[] = ['x'];
        expect(bindList(false, myParams, ['a', 'b'])).toBe('?, ?');
        expect(myParams).toEqual(['x', 'a', 'b']);
    });
});

describe('dayBounds', () => {
    it('returns the half-open [date, nextDay) range', () => {
        expect(dayBounds('2026-02-28')).toEqual(['2026-02-28', '2026-03-01']);
    });

    it('rejects malformed dates', () => {
        expect(() => dayBounds('17/09/2026')).toThrow();
    });
});

describe('shopLocalToday', () => {
    it('trusts the client local date one day ahead of UTC', () => {
        vi.setSystemTime(new Date('2026-09-17T00:30:00Z'));
        expect(shopLocalToday('2026-09-18')).toBe('2026-09-18');
    });

    it('falls back to UTC today without a usable client date', () => {
        vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
        expect(shopLocalToday()).toBe('2026-09-17');
        expect(shopLocalToday('17-09-2026')).toBe('2026-09-17');
    });

    it('clamps a client date more than a day ahead of UTC', () => {
        vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
        expect(shopLocalToday('2026-09-19')).toBe('2026-09-18');
    });

    it('clamps a stale client date — sealed-day checks must not lapse', () => {
        vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
        expect(shopLocalToday('2026-09-15')).toBe('2026-09-16');
    });
});
