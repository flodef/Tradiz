import { describe, expect, it, vi } from 'vitest';

/**
 * Tests for DB configuration detection via /api/sql/getDbConfig
 *
 * These tests verify:
 * 1. hasDbConfig is true when all required DB env vars are set
 * 2. hasDbConfig is false when any required env var is missing or empty
 * 3. hasDbConfig is false when vars are whitespace-only
 * 4. hasDbConfig uses the shopId parameter for PostgreSQL database name fallback
 */

async function loadComputeHasDbConfig() {
    vi.resetModules();
    const { computeHasDbConfig } = await import('@/app/api/sql/getDbConfig/route');
    return computeHasDbConfig;
}

describe('hasDbConfig (MariaDB mode)', () => {
    const mariaDbEnv = {
        NEXT_PUBLIC_USE_DIGICARTE: 'true',
        DB_HOST: 'localhost',
        DB_USER: 'tradiz',
        DB_PASSWORD: 'secret',
        DB_NAME: 'DC',
    };

    it('returns true when all MariaDB env vars are set', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(computeHasDbConfig(mariaDbEnv)).toBe(true);
    });

    it('returns false when DB_HOST is missing', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_USER: 'tradiz',
                DB_PASSWORD: 'secret',
            })
        ).toBe(false);
    });

    it('returns false when DB_USER is missing', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_HOST: 'localhost',
                DB_PASSWORD: 'secret',
            })
        ).toBe(false);
    });

    it('returns false when DB_PASSWORD is missing', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_HOST: 'localhost',
                DB_USER: 'tradiz',
            })
        ).toBe(false);
    });

    it('returns false when DB_HOST is an empty string', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_HOST: '',
                DB_USER: 'tradiz',
                DB_PASSWORD: 'secret',
            })
        ).toBe(false);
    });

    it('returns false when DB_HOST is whitespace only', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_HOST: '   ',
                DB_USER: 'tradiz',
                DB_PASSWORD: 'secret',
            })
        ).toBe(false);
    });

    it('returns false when DB_PASSWORD is an empty string', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_HOST: 'localhost',
                DB_USER: 'tradiz',
                DB_PASSWORD: '',
            })
        ).toBe(false);
    });

    it('returns false when all vars are missing', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(computeHasDbConfig({})).toBe(false);
    });
});

describe('hasDbConfig (PostgreSQL mode)', () => {
    const pgEnv = {
        NEXT_PUBLIC_USE_DIGICARTE: 'false',
        PG_HOST: 'localhost',
        PG_USER: 'tradiz',
        PG_PASSWORD: 'secret',
        PG_DATABASE: 'dc',
    };

    it('returns true when all PostgreSQL env vars are set', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(computeHasDbConfig(pgEnv)).toBe(true);
    });

    it('returns true with shopId parameter instead of PG_DATABASE', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(
            computeHasDbConfig(
                {
                    NEXT_PUBLIC_USE_DIGICARTE: 'false',
                    PG_HOST: 'localhost',
                    PG_USER: 'tradiz',
                    PG_PASSWORD: 'secret',
                },
                'myshop'
            )
        ).toBe(true);
    });

    it('returns false when PG_HOST is missing', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'false',
                PG_USER: 'tradiz',
                PG_PASSWORD: 'secret',
            })
        ).toBe(false);
    });

    it('returns false when both PG_DATABASE and shopId are missing', async () => {
        const computeHasDbConfig = await loadComputeHasDbConfig();
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'false',
                PG_HOST: 'localhost',
                PG_USER: 'tradiz',
                PG_PASSWORD: 'secret',
            })
        ).toBe(false);
    });
});
