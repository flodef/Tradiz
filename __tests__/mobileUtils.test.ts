import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isMobileDevice, isMobileSize } from '../src/app/utils/mobile';

// Mock window, navigator, document for tests
const mockWindow = {
    isSecureContext: true,
    screen: { availWidth: 1024 },
};
const mockNavigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};
const mockDocument = {};

describe('isMobileDevice', () => {
    const originalWindow = global.window;
    const originalNavigator = global.navigator;
    const originalDocument = global.document;

    beforeEach(() => {
        global.window = mockWindow as any;
        global.navigator = mockNavigator as any;
        global.document = mockDocument as any;
    });

    afterEach(() => {
        global.window = originalWindow;
        global.navigator = originalNavigator;
        global.document = originalDocument;
    });

    it('returns true for mobile user agent', () => {
        global.navigator = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Mobile' } as any;
        expect(isMobileDevice()).toBe(true);
    });

    it('returns true for Android user agent', () => {
        global.navigator = { userAgent: 'Mozilla/5.0 (Linux; Android 10)' } as any;
        expect(isMobileDevice()).toBe(true);
    });

    it('returns false for desktop user agent', () => {
        global.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } as any;
        expect(isMobileDevice()).toBe(false);
    });

    it('returns false when window is undefined', () => {
        global.window = undefined as any;
        expect(isMobileDevice()).toBe(false);
    });

    it('returns false when isSecureContext is false', () => {
        global.window = { isSecureContext: false, screen: { availWidth: 1024 } } as any;
        expect(isMobileDevice()).toBe(false);
    });

    it('returns false when document is undefined', () => {
        global.document = undefined as any;
        expect(isMobileDevice()).toBe(false);
    });

    it('returns true for tablet user agent', () => {
        global.navigator = { userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) Mobile' } as any;
        expect(isMobileDevice()).toBe(true);
    });
});

describe('isMobileSize', () => {
    const originalWindow = global.window;

    beforeEach(() => {
        global.window = mockWindow as any;
    });

    afterEach(() => {
        global.window = originalWindow;
    });

    it('returns true for small screen width', () => {
        global.window = { screen: { availWidth: 375 } } as any;
        expect(isMobileSize()).toBe(true);
    });

    it('returns true for screen width at threshold (767)', () => {
        global.window = { screen: { availWidth: 767 } } as any;
        expect(isMobileSize()).toBe(true);
    });

    it('returns false for large screen width', () => {
        global.window = { screen: { availWidth: 1024 } } as any;
        expect(isMobileSize()).toBe(false);
    });

    it('returns false for screen width at threshold (768)', () => {
        global.window = { screen: { availWidth: 768 } } as any;
        expect(isMobileSize()).toBe(false);
    });

    it('returns true when window is undefined (SSR)', () => {
        global.window = undefined as any;
        expect(isMobileSize()).toBe(true);
    });

    it('returns true for very small screen width', () => {
        global.window = { screen: { availWidth: 320 } } as any;
        expect(isMobileSize()).toBe(true);
    });

    it('returns false for very large screen width', () => {
        global.window = { screen: { availWidth: 1920 } } as any;
        expect(isMobileSize()).toBe(false);
    });
});
