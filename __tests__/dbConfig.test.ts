import { computeHasDbConfig, type DbConfigEnv } from '@/app/api/sql/getDbConfig/route';
import { describe, expect, it } from 'vitest';

/**
 * Tests for DB configuration detection via /api/sql/getDbConfig
 *
 * These tests verify:
 * 1. hasDbConfig is true when all required DB env vars are set
 * 2. hasDbConfig is false when any required env var is missing or empty
 * 3. hasDbConfig is false when vars are whitespace-only
 */

describe('hasDbConfig (MariaDB mode)', () => {
    const mariaDbEnv: DbConfigEnv = {
        NEXT_PUBLIC_USE_DIGICARTE: 'true',
        DB_HOST: 'localhost',
        DB_USER: 'tradiz',
        DB_PASSWORD: 'secret',
        DB_NAME: 'DC',
    };

    it('returns true when all MariaDB env vars are set', () => {
        expect(computeHasDbConfig(mariaDbEnv)).toBe(true);
    });

    it('returns false when DB_HOST is missing', () => {
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_USER: 'tradiz',
                DB_PASSWORD: 'secret',
            })
        ).toBe(false);
    });

    it('returns false when DB_USER is missing', () => {
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_HOST: 'localhost',
                DB_PASSWORD: 'secret',
            })
        ).toBe(false);
    });

    it('returns false when DB_PASSWORD is missing', () => {
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_HOST: 'localhost',
                DB_USER: 'tradiz',
            })
        ).toBe(false);
    });

    it('returns false when DB_HOST is an empty string', () => {
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_HOST: '',
                DB_USER: 'tradiz',
                DB_PASSWORD: 'secret',
            })
        ).toBe(false);
    });

    it('returns false when DB_HOST is whitespace only', () => {
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_HOST: '   ',
                DB_USER: 'tradiz',
                DB_PASSWORD: 'secret',
            })
        ).toBe(false);
    });

    it('returns false when DB_PASSWORD is an empty string', () => {
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'true',
                DB_HOST: 'localhost',
                DB_USER: 'tradiz',
                DB_PASSWORD: '',
            })
        ).toBe(false);
    });

    it('returns false when all vars are missing', () => {
        expect(computeHasDbConfig({})).toBe(false);
    });
});

describe('hasDbConfig (PostgreSQL mode)', () => {
    const pgEnv: DbConfigEnv = {
        NEXT_PUBLIC_USE_DIGICARTE: 'false',
        PG_HOST: 'localhost',
        PG_USER: 'tradiz',
        PG_PASSWORD: 'secret',
        PG_DATABASE: 'dc',
    };

    it('returns true when all PostgreSQL env vars are set', () => {
        expect(computeHasDbConfig(pgEnv)).toBe(true);
    });

    it('returns true with NEXT_PUBLIC_SHOP_ID instead of PG_DATABASE', () => {
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'false',
                PG_HOST: 'localhost',
                PG_USER: 'tradiz',
                PG_PASSWORD: 'secret',
                NEXT_PUBLIC_SHOP_ID: 'myshop',
            })
        ).toBe(true);
    });

    it('returns false when PG_HOST is missing', () => {
        expect(
            computeHasDbConfig({
                NEXT_PUBLIC_USE_DIGICARTE: 'false',
                PG_USER: 'tradiz',
                PG_PASSWORD: 'secret',
            })
        ).toBe(false);
    });

    it('returns false when both PG_DATABASE and NEXT_PUBLIC_SHOP_ID are missing', () => {
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
