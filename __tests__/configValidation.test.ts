import { Config, validateConfigData } from '@/app/contexts/ConfigProvider';
import { Mercurial, Role } from '@/app/utils/interfaces';
import { conditionalManifestScript, preloadedThemeScript } from '@/app/utils/scriptUtils';
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

// ── Bug 1: Manifest script ────────────────────────────────────────────────────

describe('conditionalManifestScript (manifest 401 fix)', () => {
    it('is empty string when USE_DIGICARTE=true', () => {
        expect(conditionalManifestScript(true)).toBe('');
    });

    it('is non-empty when USE_DIGICARTE=false', () => {
        expect(conditionalManifestScript(false)).not.toBe('');
    });

    it('contains manifest.webmanifest when USE_DIGICARTE=false', () => {
        expect(conditionalManifestScript(false)).toContain('manifest.webmanifest');
    });

    it('does not contain manifest.webmanifest when USE_DIGICARTE=true', () => {
        expect(conditionalManifestScript(true)).not.toContain('manifest.webmanifest');
    });

    it('no script is injected in Digicarte mode (prevents 401 fetch)', () => {
        const script = conditionalManifestScript(true);
        expect(script.length).toBe(0);
    });
});

// ── Preloaded theme script ─────────────────────────────────────────────────────

describe('preloadedThemeScript', () => {
    it('is a non-empty string', () => {
        expect(preloadedThemeScript()).not.toBe('');
    });

    it('contains localStorage.getItem for config', () => {
        expect(preloadedThemeScript()).toContain('localStorage.getItem');
    });

    it('contains color slot names', () => {
        const script = preloadedThemeScript();
        expect(script).toContain('writing');
        expect(script).toContain('main-from');
        expect(script).toContain('main-to');
        expect(script).toContain('popup');
        expect(script).toContain('active');
        expect(script).toContain('secondary');
        expect(script).toContain('secondary-active');
    });

    it('contains CSS variable setting logic', () => {
        expect(preloadedThemeScript()).toContain('setProperty');
        expect(preloadedThemeScript()).toContain('--');
        expect(preloadedThemeScript()).toContain('-light-color');
        expect(preloadedThemeScript()).toContain('-dark-color');
    });

    it('sets data-theme-ready attribute', () => {
        expect(preloadedThemeScript()).toContain('data-theme-ready');
    });

    it('contains 2000ms setTimeout fallback', () => {
        expect(preloadedThemeScript()).toContain('setTimeout');
        expect(preloadedThemeScript()).toContain('2000');
    });

    it('handles invalid cached config gracefully', () => {
        expect(preloadedThemeScript()).toContain('catch');
    });

    it('checks colors array length', () => {
        expect(preloadedThemeScript()).toContain('colors.length < 7');
    });
});

// ── Bug 2: Empty discounts ────────────────────────────────────────────────────

const baseConfig: Config = {
    currencies: [{ label: 'Euro', maxValue: 100, symbol: '€', decimals: 2, rate: 1, fee: 0 }],
    paymentMethods: [{ type: 'CB', id: '100', currency: '€', availability: true }],
    inventory: [{ category: 'Boulange', products: [], rate: 5.5, order: 0 }],
    discounts: [],
    printers: [],
    customers: [],
    users: [],
    colors: [
        { label: 'writing', light: '#fff', dark: '#000' },
        { label: 'main-from', light: '#fff', dark: '#000' },
        { label: 'main-to', light: '#fff', dark: '#000' },
        { label: 'popup', light: '#fff', dark: '#000' },
        { label: 'active', light: '#fff', dark: '#000' },
        { label: 'secondary', light: '#fff', dark: '#000' },
        { label: 'secondary-active', light: '#fff', dark: '#000' },
    ],
    parameters: {
        shop: { name: 'Test', address: '', zipCode: '', city: '', serial: '', email: '', id: '1' },
        thanksMessage: '',
        mercurial: Mercurial.none,
        lastModified: '0',
        closingHour: 0,
        user: { name: 'Test', role: Role.service },
    },
};

describe('storeData config validation (no-products / empty-discounts fix)', () => {
    it('undefined data (no products in DB) triggers State.error — not an infinite spinner', () => {
        expect(() => validateConfigData({} as any)).toThrow('Empty config data');
    });

    it('does not throw when discounts array is empty', () => {
        expect(() => validateConfigData({ ...baseConfig, discounts: [] })).not.toThrow();
    });

    it('returns stored when discounts has entries', () => {
        expect(() => validateConfigData({ ...baseConfig, discounts: [{ amount: 10, unit: '%' }] })).not.toThrow();
    });

    it('returns stored when all required fields are present', () => {
        expect(() => validateConfigData(baseConfig)).not.toThrow();
    });

    it('throws when currencies is empty', () => {
        expect(() => validateConfigData({ ...baseConfig, currencies: [] })).toThrow('Empty config data');
    });

    it('throws when paymentMethods is empty', () => {
        expect(() => validateConfigData({ ...baseConfig, paymentMethods: [] })).toThrow('Empty config data');
    });

    it('throws when inventory is empty', () => {
        expect(() => validateConfigData({ ...baseConfig, inventory: [] })).toThrow('Empty config data');
    });

    it('throws when colors is empty', () => {
        expect(() => validateConfigData({ ...baseConfig, colors: [] })).toThrow('Empty config data');
    });

    it('throws when parameters is null', () => {
        expect(() => validateConfigData({ ...baseConfig, parameters: {} as any })).toThrow('Empty config data');
    });
});
