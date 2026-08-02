import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbTimeoutError, isRetryableDbError, withRetry, withTimeout } from '@/app/api/sql/retry';

describe('isRetryableDbError', () => {
    it('flags transient driver codes', () => {
        expect(isRetryableDbError({ code: 'ECONNRESET' })).toBe(true);
        expect(isRetryableDbError({ code: 'PROTOCOL_CONNECTION_LOST' })).toBe(true);
        expect(isRetryableDbError({ code: '40P01' })).toBe(true); // deadlock_detected
        expect(isRetryableDbError({ code: '57P03' })).toBe(true); // cannot_connect_now
    });

    it('flags transient error messages', () => {
        expect(isRetryableDbError(new Error('Connection terminated unexpectedly'))).toBe(true);
        expect(isRetryableDbError(new Error('socket hang up'))).toBe(true);
        expect(isRetryableDbError(new Error('Query read timeout'))).toBe(true);
    });

    it('flags watchdog timeouts', () => {
        expect(isRetryableDbError(new DbTimeoutError('SELECT 1', 100))).toBe(true);
    });

    it('does not flag genuine query errors', () => {
        expect(isRetryableDbError({ code: '23505' })).toBe(false); // unique_violation
        expect(isRetryableDbError(new Error('syntax error at or near "SELCT"'))).toBe(false);
        expect(isRetryableDbError(null)).toBe(false);
    });
});

describe('withTimeout', () => {
    it('resolves when the promise settles in time', async () => {
        await expect(withTimeout(Promise.resolve('ok'), 1000, 'q')).resolves.toBe('ok');
    });

    it('rejects with DbTimeoutError when the promise hangs', async () => {
        vi.useFakeTimers();
        const pending = new Promise(() => {});
        const raced = withTimeout(pending, 50, 'SELECT 1');
        const assertion = expect(raced).rejects.toBeInstanceOf(DbTimeoutError);
        await vi.advanceTimersByTimeAsync(60);
        await assertion;
        vi.useRealTimers();
    });

    it('passes the promise through when no timeout is configured', async () => {
        await expect(withTimeout(Promise.resolve(42), 0, 'q')).resolves.toBe(42);
    });
});

describe('withRetry', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the first successful result without retrying', async () => {
        const fn = vi.fn().mockResolvedValue('ok');
        await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries transient failures and eventually succeeds', async () => {
        const fn = vi
            .fn()
            .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'ECONNRESET' }))
            .mockResolvedValue('ok');
        await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('gives up after maxAttempts and rethrows the last error', async () => {
        const error = Object.assign(new Error('still down'), { code: 'ECONNRESET' });
        const fn = vi.fn().mockRejectedValue(error);
        await expect(withRetry(fn, { baseDelayMs: 1, maxAttempts: 3 })).rejects.toBe(error);
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('does not retry non-transient errors', async () => {
        const error = Object.assign(new Error('duplicate key'), { code: '23505' });
        const fn = vi.fn().mockRejectedValue(error);
        await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toBe(error);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries an attempt that exceeds the watchdog timeout', async () => {
        let calls = 0;
        const fn = vi.fn(async () => {
            calls += 1;
            if (calls === 1) return new Promise(() => {}); // hangs forever
            return 'ok';
        });
        await expect(withRetry(fn, { baseDelayMs: 1, timeoutMs: 20 })).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('passes the attempt number to the callback', async () => {
        const seen: number[] = [];
        const fn = vi.fn(async (attempt: number) => {
            seen.push(attempt);
            if (attempt < 3) throw Object.assign(new Error('boom'), { code: 'ECONNRESET' });
            return 'ok';
        });
        await expect(withRetry(fn, { baseDelayMs: 1, maxAttempts: 3 })).resolves.toBe('ok');
        expect(seen).toEqual([1, 2, 3]);
    });
});
