import { IS_LOCAL, USE_DIGICARTE } from '../utils/constants';

export const SHOP_ID = IS_LOCAL || USE_DIGICARTE ? process.env.NEXT_PUBLIC_SHOP_ID : getShopFromSubdomain();

/**
 * Extracts the shop ID from the subdomain of the current hostname.
 * e.g. annette.tradiz.fr → "annette", localhost → ""
 * Must only be called client-side (requires window).
 */
export function getShopFromSubdomain(): string {
    if (typeof window === 'undefined') return '';
    const parts = window.location.hostname.split('.');
    // Only treat the first label as a shop if there are at least 3 parts (subdomain.domain.tld)
    if (parts.length < 3) return '';
    return parts[0];
}

/**
 * Server-safe version: extracts shop ID from a provided hostname.
 * e.g. annette.tradiz.fr → "annette", localhost → ""
 */
export function getShopFromHostname(hostname: string): string {
    const parts = hostname.split('.');
    // Only treat the first label as a shop if there are at least 3 parts (subdomain.domain.tld)
    if (parts.length < 3) return '';
    return parts[0];
}

/**
 * Env var names holding the shop ID, in priority order.
 *
 * `SHOP_ID` is preferred because, lacking the `NEXT_PUBLIC_` prefix, it is never a
 * candidate for build-time inlining and is therefore always read at runtime.
 * `NEXT_PUBLIC_SHOP_ID` is kept as a fallback for existing `.env.local` files.
 */
const SHOP_ID_ENV_KEYS = ['SHOP_ID', 'NEXT_PUBLIC_SHOP_ID'] as const;

/**
 * Reads the shop ID from the environment at runtime.
 *
 * Server-side only. The lookup uses a dynamic key so the bundler cannot inline the
 * value at build time — this ensures we read what Electron's `.env.local` loader put
 * in `process.env`, not the build-time value (undefined in CI builds without `.env.local`).
 */
function readShopIdFromEnv(): string {
    for (const key of SHOP_ID_ENV_KEYS) {
        const value = process.env[key];
        if (value) return value;
    }
    return '';
}

/**
 * Extracts shop ID from a hostname string, with fallback to environment variable for local/digicarte mode.
 * This is the server-side version that combines getShopFromHostname with the environment fallback.
 */
export function getShopIdFromHostname(hostname: string): string {
    if (IS_LOCAL || USE_DIGICARTE) return readShopIdFromEnv();
    return getShopFromHostname(hostname);
}

/**
 * Extracts shop ID from a Next.js Request object for server-side multi-tenancy.
 * Falls back to environment variable for local/digicarte mode.
 */
export function getShopIdFromRequest(request: Request): string {
    const hostname = request.headers.get('host') || '';
    return getShopIdFromHostname(hostname);
}

/**
 * Fetches the shop ID from the server API at runtime.
 * Use this on the client when the build-time NEXT_PUBLIC_SHOP_ID is not baked
 * (e.g. CI builds without .env.local).
 */
export async function fetchShopId(): Promise<string> {
    try {
        const res = await fetch('/api/shop-id');
        if (!res.ok) return '';
        const data = await res.json();
        return data.shopId || '';
    } catch {
        return '';
    }
}
