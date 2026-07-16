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
 * Extracts shop ID from a Next.js Request object for server-side multi-tenancy.
 * Falls back to environment variable for local/digicarte mode.
 */
export function getShopIdFromRequest(request: Request): string {
    const hostname = request.headers.get('host') || '';
    return IS_LOCAL || USE_DIGICARTE ? process.env.NEXT_PUBLIC_SHOP_ID || '' : getShopFromHostname(hostname);
}
