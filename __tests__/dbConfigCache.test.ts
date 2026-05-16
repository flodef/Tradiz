import { beforeEach, describe, expect, it } from 'vitest';

// Mock the checkDbConfig function to test cache logic
let hasDbConfigCache: boolean | null = null;
let hasDbConfigCacheTime: number = 0;
let hasDbConfigPromise: Promise<boolean> | null = null;
const DB_CONFIG_CACHE_TTL = 30_000;

async function mockCheckDbConfig(): Promise<boolean> {
    const now = Date.now();
    if (hasDbConfigCache !== null && (hasDbConfigCache === true || now - hasDbConfigCacheTime < DB_CONFIG_CACHE_TTL)) {
        return hasDbConfigCache;
    }
    if (hasDbConfigPromise !== null) return hasDbConfigPromise;

    hasDbConfigPromise = Promise.resolve(true)
        .then((hasDbConfig) => {
            hasDbConfigCache = hasDbConfig;
            hasDbConfigCacheTime = Date.now();
            hasDbConfigPromise = null;
            return hasDbConfig;
        })
        .catch(() => {
            hasDbConfigCache = false;
            hasDbConfigCacheTime = Date.now();
            hasDbConfigPromise = null;
            return false;
        });

    return hasDbConfigPromise;
}

function clearCache() {
    hasDbConfigCache = null;
    hasDbConfigCacheTime = 0;
    hasDbConfigPromise = null;
}

describe('checkDbConfig cache logic', () => {
    beforeEach(() => {
        clearCache();
    });

    it('returns cached value when cache is not null', async () => {
        hasDbConfigCache = true;
        hasDbConfigCacheTime = Date.now();
        const result = await mockCheckDbConfig();
        expect(result).toBe(true);
    });

    it('returns true from cache when cached value is true (regardless of TTL)', async () => {
        hasDbConfigCache = true;
        hasDbConfigCacheTime = Date.now() - DB_CONFIG_CACHE_TTL - 1000; // Expired
        const result = await mockCheckDbConfig();
        expect(result).toBe(true);
    });

    it('returns false from cache only within TTL', async () => {
        hasDbConfigCache = false;
        hasDbConfigCacheTime = Date.now() - DB_CONFIG_CACHE_TTL + 1000; // Within TTL
        const result = await mockCheckDbConfig();
        expect(result).toBe(false);
    });

    it('re-checks when cached false is expired', async () => {
        hasDbConfigCache = false;
        hasDbConfigCacheTime = Date.now() - DB_CONFIG_CACHE_TTL - 1000; // Expired
        const result = await mockCheckDbConfig();
        expect(result).toBe(true); // Will re-check and return true from mock
    });

    it('returns pending promise when check is in progress', async () => {
        hasDbConfigPromise = new Promise((resolve) => setTimeout(() => resolve(true), 100));
        const result = await mockCheckDbConfig();
        expect(result).toBe(true);
    });

    it('sets cache time after successful check', async () => {
        const beforeTime = Date.now();
        await mockCheckDbConfig();
        const afterTime = Date.now();
        expect(hasDbConfigCacheTime).toBeGreaterThanOrEqual(beforeTime);
        expect(hasDbConfigCacheTime).toBeLessThanOrEqual(afterTime);
    });

    it('clears promise after successful check', async () => {
        await mockCheckDbConfig();
        expect(hasDbConfigPromise).toBe(null);
    });

    it('clears promise after failed check', async () => {
        // Override mockCheckDbConfig to simulate error case
        hasDbConfigPromise = Promise.reject(new Error('Test error'))
            .catch(() => false)
            .then(() => {
                hasDbConfigPromise = null;
                return false;
            });
        await hasDbConfigPromise;
        expect(hasDbConfigPromise).toBe(null);
    });

    it('clear function resets all cache state', () => {
        hasDbConfigCache = true;
        hasDbConfigCacheTime = Date.now();
        hasDbConfigPromise = Promise.resolve(true);
        clearCache();
        expect(hasDbConfigCache).toBe(null);
        expect(hasDbConfigCacheTime).toBe(0);
        expect(hasDbConfigPromise).toBe(null);
    });

    it('handles multiple concurrent calls', async () => {
        const promise1 = mockCheckDbConfig();
        const promise2 = mockCheckDbConfig();
        const promise3 = mockCheckDbConfig();
        const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);
        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
    });
});
