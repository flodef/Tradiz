import {
    checkDbConfigWithFetcher,
    clearDbConfigCache,
    DB_CONFIG_CACHE_TTL,
    getDbConfigCacheState,
    setDbConfigCacheState,
} from '@/app/utils/processData';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for checkDbConfig caching logic.
 *
 * These tests use the real checkDbConfigWithFetcher from processData.ts
 * with injected mock fetchers to test the caching behavior without
 * making actual HTTP requests.
 */

describe('checkDbConfig cache logic', () => {
    beforeEach(() => {
        clearDbConfigCache();
    });

    it('returns cached value when cache is not null', async () => {
        setDbConfigCacheState({ cache: true, cacheTime: Date.now() });
        const result = await checkDbConfigWithFetcher(() => Promise.resolve(true));
        expect(result).toBe(true);
    });

    it('returns true from cache when cached value is true (regardless of TTL)', async () => {
        setDbConfigCacheState({
            cache: true,
            cacheTime: Date.now() - DB_CONFIG_CACHE_TTL - 1000, // Expired
        });
        const result = await checkDbConfigWithFetcher(() => Promise.resolve(true));
        expect(result).toBe(true);
    });

    it('returns false from cache only within TTL', async () => {
        setDbConfigCacheState({
            cache: false,
            cacheTime: Date.now() - DB_CONFIG_CACHE_TTL + 1000, // Within TTL
        });
        const result = await checkDbConfigWithFetcher(() => Promise.resolve(true));
        expect(result).toBe(false);
    });

    it('re-checks when cached false is expired', async () => {
        setDbConfigCacheState({
            cache: false,
            cacheTime: Date.now() - DB_CONFIG_CACHE_TTL - 1000, // Expired
        });
        const result = await checkDbConfigWithFetcher(() => Promise.resolve(true));
        expect(result).toBe(true); // Will re-check and return true from fetcher
    });

    it('returns pending promise when check is in progress', async () => {
        const pendingPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 100));
        setDbConfigCacheState({ promise: pendingPromise });
        const result = await checkDbConfigWithFetcher(() => Promise.resolve(true));
        expect(result).toBe(true);
    });

    it('sets cache time after successful check', async () => {
        const beforeTime = Date.now();
        await checkDbConfigWithFetcher(() => Promise.resolve(true));
        const { cacheTime } = getDbConfigCacheState();
        const afterTime = Date.now();
        expect(cacheTime).toBeGreaterThanOrEqual(beforeTime);
        expect(cacheTime).toBeLessThanOrEqual(afterTime);
    });

    it('clears promise after successful check', async () => {
        await checkDbConfigWithFetcher(() => Promise.resolve(true));
        const { promise } = getDbConfigCacheState();
        expect(promise).toBe(null);
    });

    it('clears promise after failed check', async () => {
        await checkDbConfigWithFetcher(() => Promise.reject(new Error('Test error')));
        const { promise } = getDbConfigCacheState();
        expect(promise).toBe(null);
    });

    it('sets cache to false after failed check', async () => {
        await checkDbConfigWithFetcher(() => Promise.reject(new Error('Test error')));
        const { cache } = getDbConfigCacheState();
        expect(cache).toBe(false);
    });

    it('clearDbConfigCache resets all cache state', () => {
        setDbConfigCacheState({
            cache: true,
            cacheTime: Date.now(),
            promise: Promise.resolve(true),
        });
        clearDbConfigCache();
        const state = getDbConfigCacheState();
        expect(state.cache).toBe(null);
        expect(state.cacheTime).toBe(0);
        expect(state.promise).toBe(null);
    });

    it('handles multiple concurrent calls', async () => {
        const promise1 = checkDbConfigWithFetcher(() => Promise.resolve(true));
        const promise2 = checkDbConfigWithFetcher(() => Promise.resolve(true));
        const promise3 = checkDbConfigWithFetcher(() => Promise.resolve(true));
        const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);
        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
    });

    it('uses fetcher result when cache is empty', async () => {
        const result = await checkDbConfigWithFetcher(() => Promise.resolve(true));
        expect(result).toBe(true);
    });

    it('fetcher error returns false and sets cache to false', async () => {
        const result = await checkDbConfigWithFetcher(() => Promise.reject(new Error('Network error')));
        expect(result).toBe(false);
        const { cache } = getDbConfigCacheState();
        expect(cache).toBe(false);
    });
});
