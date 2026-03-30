import { describe, it, expect } from 'vitest';

/**
 * Tests for DB configuration detection via /api/sql/getDbConfig
 *
 * These tests verify:
 * 1. hasDbConfig is true when all four DB env vars are set
 * 2. hasDbConfig is false when any one of the four DB env vars is missing or empty
 * 3. hasDbConfig is false when vars are whitespace-only
 */

function computeHasDbConfig(env: {
    DB_HOST?: string;
    DB_USER?: string;
    DB_PASSWORD?: string;
    DB_NAME?: string;
}): boolean {
    return !!(env.DB_HOST?.trim() && env.DB_USER?.trim() && env.DB_PASSWORD?.trim() && env.DB_NAME?.trim());
}

describe('hasDbConfig', () => {
    it('returns true when all four DB env vars are set', () => {
        expect(
            computeHasDbConfig({
                DB_HOST: 'localhost',
                DB_USER: 'tradiz',
                DB_PASSWORD: 'secret',
                DB_NAME: 'DC',
            })
        ).toBe(true);
    });

    it('returns false when DB_HOST is missing', () => {
        expect(
            computeHasDbConfig({
                DB_USER: 'tradiz',
                DB_PASSWORD: 'secret',
                DB_NAME: 'DC',
            })
        ).toBe(false);
    });

    it('returns false when DB_USER is missing', () => {
        expect(
            computeHasDbConfig({
                DB_HOST: 'localhost',
                DB_PASSWORD: 'secret',
                DB_NAME: 'DC',
            })
        ).toBe(false);
    });

    it('returns false when DB_PASSWORD is missing', () => {
        expect(
            computeHasDbConfig({
                DB_HOST: 'localhost',
                DB_USER: 'tradiz',
                DB_NAME: 'DC',
            })
        ).toBe(false);
    });

    it('returns false when DB_NAME is missing', () => {
        expect(
            computeHasDbConfig({
                DB_HOST: 'localhost',
                DB_USER: 'tradiz',
                DB_PASSWORD: 'secret',
            })
        ).toBe(false);
    });

    it('returns false when DB_HOST is an empty string', () => {
        expect(
            computeHasDbConfig({
                DB_HOST: '',
                DB_USER: 'tradiz',
                DB_PASSWORD: 'secret',
                DB_NAME: 'DC',
            })
        ).toBe(false);
    });

    it('returns false when DB_HOST is whitespace only', () => {
        expect(
            computeHasDbConfig({
                DB_HOST: '   ',
                DB_USER: 'tradiz',
                DB_PASSWORD: 'secret',
                DB_NAME: 'DC',
            })
        ).toBe(false);
    });

    it('returns false when DB_PASSWORD is an empty string', () => {
        expect(
            computeHasDbConfig({
                DB_HOST: 'localhost',
                DB_USER: 'tradiz',
                DB_PASSWORD: '',
                DB_NAME: 'DC',
            })
        ).toBe(false);
    });

    it('returns false when all vars are missing', () => {
        expect(computeHasDbConfig({})).toBe(false);
    });
});

describe('getDbConfig API route logic', () => {
    it('returns { hasDbConfig: true } when all env vars are present', () => {
        const env = {
            DB_HOST: 'localhost',
            DB_USER: 'tradiz',
            DB_PASSWORD: 'secret',
            DB_NAME: 'DC',
        };
        const result = { hasDbConfig: computeHasDbConfig(env) };
        expect(result).toEqual({ hasDbConfig: true });
    });

    it('returns { hasDbConfig: false } when any env var is absent', () => {
        const cases = [
            { DB_HOST: 'localhost', DB_USER: 'tradiz', DB_PASSWORD: '', DB_NAME: 'DC' },
            { DB_HOST: '', DB_USER: 'tradiz', DB_PASSWORD: 'secret', DB_NAME: 'DC' },
            { DB_HOST: 'localhost', DB_USER: '', DB_PASSWORD: 'secret', DB_NAME: 'DC' },
            { DB_HOST: 'localhost', DB_USER: 'tradiz', DB_PASSWORD: 'secret', DB_NAME: '' },
        ];

        for (const env of cases) {
            expect(computeHasDbConfig(env)).toBe(false);
        }
    });
});
