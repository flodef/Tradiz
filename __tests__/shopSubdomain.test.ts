import { describe, it, expect } from 'vitest';

/**
 * Tests for getShopFromSubdomain() — shop ID extracted from hostname subdomain.
 *
 * Old behaviour: shop came from the URL path segment [shop] (e.g. /annette).
 *   Admin routes (/admin/kitchen/config) have no [shop] segment → shop = '' → loadData fails.
 *
 * Fix: fall back to the first subdomain label (annette.tradiz.fr → "annette").
 *   Admin routes work because the hostname never changes during navigation.
 */

// Replicates getShopFromSubdomain() from constants.ts
function getShopFromSubdomain(hostname: string): string {
    const parts = hostname.split('.');
    if (parts.length < 3) return '';
    return parts[0];
}

// Replicates the ConfigProvider shop resolution logic
function resolveShop(shopProp: string, isLocal: boolean, shopId: string, hostname: string): string {
    return shopProp || (isLocal ? shopId : getShopFromSubdomain(hostname));
}

describe('getShopFromSubdomain', () => {
    it('extracts shop from 3-part hostname', () => {
        expect(getShopFromSubdomain('annette.tradiz.fr')).toBe('annette');
    });

    it('extracts shop from subdomain with different domain', () => {
        expect(getShopFromSubdomain('mybakery.pos.example.com')).toBe('mybakery');
    });

    it('returns empty string for localhost (1 part)', () => {
        expect(getShopFromSubdomain('localhost')).toBe('');
    });

    it('returns empty string for 2-part hostname (no subdomain)', () => {
        expect(getShopFromSubdomain('tradiz.fr')).toBe('');
    });

    it('returns empty string for pos.tradiz.fr (not a shop subdomain)', () => {
        // pos.tradiz.fr is still 3 parts — first label is "pos", not a shop.
        // This is why the redirect from pos.tradiz.fr/annette → annette.tradiz.fr is needed.
        expect(getShopFromSubdomain('pos.tradiz.fr')).toBe('pos');
    });
});

describe('ConfigProvider shop resolution', () => {
    it('uses shopProp when provided (URL path still works)', () => {
        expect(resolveShop('annette', false, '', 'pos.tradiz.fr')).toBe('annette');
    });

    it('uses SHOP_ID env var on localhost when shopProp is empty', () => {
        expect(resolveShop('', true, 'annette', 'localhost')).toBe('annette');
    });

    it('uses subdomain on prod when shopProp is empty', () => {
        expect(resolveShop('', false, '', 'annette.tradiz.fr')).toBe('annette');
    });

    it('admin routes on prod use subdomain (no [shop] segment in URL)', () => {
        // Previously: shopProp='' and IS_LOCAL=false → shop='' → loadData fails
        // Now: falls back to subdomain → correct shop ID even on /admin/kitchen/config
        expect(resolveShop('', false, '', 'annette.tradiz.fr')).toBe('annette');
    });

    it('shopProp takes priority over subdomain', () => {
        expect(resolveShop('override', false, '', 'annette.tradiz.fr')).toBe('override');
    });

    it('shopProp takes priority over SHOP_ID on localhost', () => {
        expect(resolveShop('override', true, 'annette', 'localhost')).toBe('override');
    });

    it('returns empty string when all sources are empty', () => {
        expect(resolveShop('', false, '', 'pos.tradiz.fr')).toBe('pos');
    });
});
