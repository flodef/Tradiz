import { describe, it, expect } from 'vitest';
import { getOpenStatus, sanitizeOpeningHours } from '@/app/site/types';
import type { OpeningHours } from '@/app/site/types';

// 2026-09-11 is a Friday (adminDay 4), 2026-09-12 a Saturday (adminDay 5)
const at = (day: string, time: string) => new Date(`${day}T${time}:00`);

describe('getOpenStatus', () => {
    const dayHours: OpeningHours = { 4: [{ open: '06:00', close: '19:00' }] };

    it('reports open during a same-day slot', () => {
        expect(getOpenStatus(dayHours, at('2026-09-11', '10:00')).status).toBe('open');
    });

    it('reports closed outside slots with next opening time', () => {
        const s = getOpenStatus(dayHours, at('2026-09-11', '20:00'));
        expect(s.status).toBe('closed');
        expect(s.minutesUntilChange).toBeGreaterThan(0);
    });

    it('returns unknown when no hours are configured', () => {
        expect(getOpenStatus(undefined, at('2026-09-11', '10:00')).status).toBe('unknown');
        expect(getOpenStatus({}, at('2026-09-11', '10:00')).status).toBe('unknown');
    });

    it('returns unknown on malformed data instead of crashing', () => {
        expect(getOpenStatus({ 4: 'not-an-array' } as never, at('2026-09-11', '10:00')).status).toBe(
            'unknown'
        );
        expect(
            getOpenStatus({ 4: [{ open: 'abc', close: 'xyz' }] } as never, at('2026-09-11', '10:00'))
                .status
        ).toBe('unknown');
        expect(
            getOpenStatus({ 4: [{ open: '06:00' }] } as never, at('2026-09-11', '10:00')).status
        ).toBe('unknown');
    });

    describe('overnight slots (20:00 → 02:00)', () => {
        const overnight: OpeningHours = { 4: [{ open: '20:00', close: '02:00' }] };

        it('is closed the morning before the slot opens', () => {
            const s = getOpenStatus(overnight, at('2026-09-11', '01:00'));
            expect(s.status).toBe('closed');
        });

        it('is open during the evening part', () => {
            expect(getOpenStatus(overnight, at('2026-09-11', '23:00')).status).toBe('open');
        });

        it("is open during the next day's early hours", () => {
            const s = getOpenStatus(overnight, at('2026-09-12', '01:00'));
            expect(s.status).toBe('open');
            expect(s.nextChange).toBe('02:00');
            expect(s.minutesUntilChange).toBe(60);
        });

        it("is closed after the next day's close", () => {
            expect(getOpenStatus(overnight, at('2026-09-12', '03:00')).status).toBe('closed');
        });
    });
});

describe('sanitizeOpeningHours', () => {
    it('drops malformed entries and keeps valid ones', () => {
        const byDay = sanitizeOpeningHours({
            0: [{ open: '06:00', close: '19:00' }],
            1: [{ open: 'bad', close: 'worse' }],
            2: 'garbage',
            3: [{ open: '08:00' }],
        } as unknown as OpeningHours);
        expect(byDay.size).toBe(1);
        expect(byDay.get(0)?.[0].openMin).toBe(360);
    });
});
