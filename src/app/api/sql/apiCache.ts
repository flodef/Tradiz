// Tiny in-process TTL cache for hot per-request lookups (device auth,
// subscription, feature flags). The embedded Next server is a long-lived
// process, so a short-lived cache avoids paying a remote-DB round trip
// (~150-400 ms to Neon) on every API call for data that barely changes.
// Keys always carry the shopId because one process can serve several
// databases (?shop=) — mutations invalidate their own cache family.
//
// Multi-instance caveat: on Vercel each lambda holds its own Map, so
// invalidateApiCache only reaches the mutating process — other instances
// serve the stale entry until its TTL expires. That window is accepted for
// flags/subscription (30 s) but kept short for device auth, the only
// security-relevant family (revocation propagates in ≤5 s per instance).
const TTL_MS = 30_000;
export const DEVICE_AUTH_TTL_MS = 5_000;

// Entries are never evicted on their own — sweep expired ones when the map
// grows past a bound so stale keys cannot accumulate for the process lifetime.
const MAX_ENTRIES = 500;

interface CacheEntry {
    value: unknown;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Returns the cached value when fresh, otherwise runs `fn` and stores the
 * result. `cacheIf` lets callers skip caching some outcomes (e.g. denied
 * auth or a fail-closed fallback that must not pin itself). `ttlMs`
 * overrides the default 30 s for security-sensitive families. Concurrent
 * misses may stampede — each caller still gets a correct value.
 */
export async function cached<T>(
    key: string,
    fn: () => Promise<T>,
    cacheIf?: (value: T) => boolean,
    ttlMs: number = TTL_MS
): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    const value = await fn();
    if (!cacheIf || cacheIf(value)) {
        if (cache.size >= MAX_ENTRIES) {
            const now = Date.now();
            for (const [k, entry] of cache) {
                if (entry.expiresAt <= now) cache.delete(k);
            }
        }
        cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    return value;
}

// Drop entries — `prefix` limits the flush to one family (e.g. 'dev:',
// 'sub:'); omit it to clear everything.
export function invalidateApiCache(prefix?: string) {
    if (!prefix) {
        cache.clear();
        return;
    }
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) cache.delete(key);
    }
}
