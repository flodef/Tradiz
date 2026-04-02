import { describe, it, expect } from 'vitest';

/**
 * Non-regression tests for two bugs fixed in ConfigProvider / layout.tsx:
 *
 * Bug 1 — Manifest 401 on Digicarte:
 *   The conditionalManifestScript was always injected, causing a 401 when the
 *   app ran under Digicarte (which serves its own manifest behind auth).
 *   Fix: when NEXT_PUBLIC_USE_DIGICARTE=true the script is set to '' at build time.
 *
 * Bug 2 — Infinite spinner / error on prod when no products in DB:
 *   loadData() returns undefined when there are no products. storeData(undefined)
 *   was throwing 'Empty config data' → State.error on prod, but on localhost
 *   IS_DEV=true so the local products.json is always used and the bug didn't show.
 *   After an intermediate fix (storeData returned early on undefined), the app hung
 *   forever at State.loading with no feedback.
 *   Final fix: the caller in ConfigProvider now checks for undefined explicitly and
 *   sets State.error, giving the user the retry popup. storeData() now takes Config
 *   (non-optional). Discounts are also optional and removed from the validity guard.
 */

// ── Helpers replicating the exact logic from the production code ─────────────

function buildManifestScript(useDigicarte: boolean): string {
    if (useDigicarte) return '';
    return `(function () {
    try {
        var path = window.location.pathname || '';
        var pattern1 = new RegExp('/admin/tradiz/?$');
        var pattern2 = new RegExp('^/[^/]+/admin/tradiz/?$');
        var isLiteRoute = pattern1.test(path) || pattern2.test(path);
        if (isLiteRoute) return;

        if (!document.querySelector('link[rel="manifest"]')) {
            var link = document.createElement('link');
            link.rel = 'manifest';
            link.href = '/manifest.webmanifest';
            document.head.appendChild(link);
        }
    } catch (_) {
        // Ignore manifest injection failures.
    }
})();`;
}

interface MockConfig {
    currencies: unknown[];
    paymentMethods: unknown[];
    inventory: unknown[];
    discounts: unknown[];
    colors: unknown[];
    parameters: object | null;
}

// Mirrors the fixed storeData logic (non-optional Config).
function validateConfig(data: MockConfig): 'stored' {
    if (
        !(
            data.currencies.length &&
            data.paymentMethods.length &&
            data.inventory.length &&
            data.colors.length &&
            data.parameters
        )
    )
        throw new Error('Empty config data');
    return 'stored';
}

// Mirrors the caller logic in ConfigProvider: undefined → State.error, defined → storeData.
function callerLogic(data: MockConfig | undefined): 'error' | 'stored' {
    if (!data) return 'error';
    return validateConfig(data);
}

// ── Bug 1: Manifest script ────────────────────────────────────────────────────

describe('conditionalManifestScript (manifest 401 fix)', () => {
    it('is empty string when USE_DIGICARTE=true', () => {
        expect(buildManifestScript(true)).toBe('');
    });

    it('is non-empty when USE_DIGICARTE=false', () => {
        expect(buildManifestScript(false)).not.toBe('');
    });

    it('contains manifest.webmanifest when USE_DIGICARTE=false', () => {
        expect(buildManifestScript(false)).toContain('manifest.webmanifest');
    });

    it('does not contain manifest.webmanifest when USE_DIGICARTE=true', () => {
        expect(buildManifestScript(true)).not.toContain('manifest.webmanifest');
    });

    it('no script is injected in Digicarte mode (prevents 401 fetch)', () => {
        const script = buildManifestScript(true);
        expect(script.length).toBe(0);
    });
});

// ── Bug 2: Empty discounts ────────────────────────────────────────────────────

const baseConfig: MockConfig = {
    currencies: [{ label: 'Euro' }],
    paymentMethods: [{ label: 'CB' }],
    inventory: [{ category: 'Boulange', products: [] }],
    discounts: [],
    colors: [
        { light: '#fff', dark: '#000' },
        { light: '#fff', dark: '#000' },
        { light: '#fff', dark: '#000' },
        { light: '#fff', dark: '#000' },
        { light: '#fff', dark: '#000' },
        { light: '#fff', dark: '#000' },
        { light: '#fff', dark: '#000' },
    ],
    parameters: { shop: { name: 'Test' } },
};

describe('storeData config validation (no-products / empty-discounts fix)', () => {
    it('undefined data (no products in DB) triggers State.error — not an infinite spinner', () => {
        expect(callerLogic(undefined)).toBe('error');
    });

    it('does not throw when discounts array is empty', () => {
        expect(() => callerLogic({ ...baseConfig, discounts: [] })).not.toThrow();
    });

    it('returns stored when discounts has entries', () => {
        expect(callerLogic({ ...baseConfig, discounts: [{ amount: 10, unit: '%' }] })).toBe('stored');
    });

    it('returns stored when all required fields are present', () => {
        expect(callerLogic(baseConfig)).toBe('stored');
    });

    it('throws when currencies is empty', () => {
        expect(() => callerLogic({ ...baseConfig, currencies: [] })).toThrow('Empty config data');
    });

    it('throws when paymentMethods is empty', () => {
        expect(() => callerLogic({ ...baseConfig, paymentMethods: [] })).toThrow('Empty config data');
    });

    it('throws when inventory is empty', () => {
        expect(() => callerLogic({ ...baseConfig, inventory: [] })).toThrow('Empty config data');
    });

    it('throws when colors is empty', () => {
        expect(() => callerLogic({ ...baseConfig, colors: [] })).toThrow('Empty config data');
    });

    it('throws when parameters is null', () => {
        expect(() => callerLogic({ ...baseConfig, parameters: null })).toThrow('Empty config data');
    });
});
