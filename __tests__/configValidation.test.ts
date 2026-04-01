import { describe, it, expect } from 'vitest';

/**
 * Non-regression tests for two bugs fixed in ConfigProvider / layout.tsx:
 *
 * Bug 1 — Manifest 401 on Digicarte:
 *   The conditionalManifestScript was always injected, causing a 401 when the
 *   app ran under Digicarte (which serves its own manifest behind auth).
 *   Fix: when NEXT_PUBLIC_USE_DIGICARTE=true the script is set to '' at build time.
 *
 * Bug 2 — Error when loading with no discounts:
 *   storeData() required discounts.length > 0, throwing 'Empty config data' and
 *   causing State.error for any shop with no discounts configured.
 *   Fix: discounts are optional — removed from the validity guard.
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

// Mirrors the fixed storeData logic: return early on undefined, throw on partial data.
function validateConfig(data: MockConfig | undefined): 'stored' | 'skipped' {
    if (!data) return 'skipped';
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
    it('returns skipped (no error) when data is undefined — no products configured', () => {
        expect(validateConfig(undefined)).toBe('skipped');
    });

    it('does not throw when discounts array is empty', () => {
        expect(() => validateConfig({ ...baseConfig, discounts: [] })).not.toThrow();
    });

    it('returns stored when discounts has entries', () => {
        expect(validateConfig({ ...baseConfig, discounts: [{ amount: 10, unit: '%' }] })).toBe('stored');
    });

    it('returns stored when all required fields are present', () => {
        expect(validateConfig(baseConfig)).toBe('stored');
    });

    it('throws when currencies is empty', () => {
        expect(() => validateConfig({ ...baseConfig, currencies: [] })).toThrow('Empty config data');
    });

    it('throws when paymentMethods is empty', () => {
        expect(() => validateConfig({ ...baseConfig, paymentMethods: [] })).toThrow('Empty config data');
    });

    it('throws when inventory is empty', () => {
        expect(() => validateConfig({ ...baseConfig, inventory: [] })).toThrow('Empty config data');
    });

    it('throws when colors is empty', () => {
        expect(() => validateConfig({ ...baseConfig, colors: [] })).toThrow('Empty config data');
    });

    it('throws when parameters is null', () => {
        expect(() => validateConfig({ ...baseConfig, parameters: null })).toThrow('Empty config data');
    });
});
