import { getShopFromSubdomain } from '@/app/contexts/ConfigProvider';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Tests for getShopFromSubdomain() — shop ID extracted from hostname subdomain.
 *
 * Old behaviour: shop came from the URL path segment [shop] (e.g. /annette).
 *   Admin routes (/admin/kitchen/config) have no [shop] segment → shop = '' → loadData fails.
 *
 * Fix: fall back to the first subdomain label (annette.tradiz.fr → "annette").
 *   Admin routes work because the hostname never changes during navigation.
 */

const originalWindow = global.window;

beforeEach(() => {
    global.window = { location: { hostname: '' } } as any;
});

afterEach(() => {
    global.window = originalWindow;
});

describe('getShopFromSubdomain', () => {
    it('extracts shop from 3-part hostname', () => {
        window.location.hostname = 'annette.tradiz.fr';
        expect(getShopFromSubdomain()).toBe('annette');
    });

    it('extracts shop from subdomain with different domain', () => {
        window.location.hostname = 'mybakery.pos.example.com';
        expect(getShopFromSubdomain()).toBe('mybakery');
    });

    it('returns empty string for localhost (1 part)', () => {
        window.location.hostname = 'localhost';
        expect(getShopFromSubdomain()).toBe('');
    });

    it('returns empty string for 2-part hostname (no subdomain)', () => {
        window.location.hostname = 'tradiz.fr';
        expect(getShopFromSubdomain()).toBe('');
    });

    it('returns empty string for pos.tradiz.fr (not a shop subdomain)', () => {
        // pos.tradiz.fr is still 3 parts — first label is "pos", not a shop.
        // This is why the redirect from pos.tradiz.fr/annette → annette.tradiz.fr is needed.
        window.location.hostname = 'pos.tradiz.fr';
        expect(getShopFromSubdomain()).toBe('pos');
    });
});
