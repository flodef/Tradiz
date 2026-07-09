import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWindowParam, ColorScheme } from '../src/app/hooks/useWindowParam';

describe('useWindowParam', () => {
    beforeEach(() => {
        // Mock window.matchMedia
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    it('should return window size object', () => {
        const { result } = renderHook(() => useWindowParam());
        expect(result.current).toHaveProperty('width');
        expect(result.current).toHaveProperty('height');
        expect(typeof result.current.width).toBe('number');
        expect(typeof result.current.height).toBe('number');
    });

    it('should return window position object', () => {
        const { result } = renderHook(() => useWindowParam());
        expect(result.current).toHaveProperty('top');
        expect(result.current).toHaveProperty('left');
        expect(typeof result.current.top).toBe('number');
        expect(typeof result.current.left).toBe('number');
    });

    it('should return color scheme', () => {
        const { result } = renderHook(() => useWindowParam());
        expect(result.current).toHaveProperty('colorScheme');
        expect([ColorScheme.Light, ColorScheme.Dark]).toContain(result.current.colorScheme);
    });

    it('should return online status', () => {
        const { result } = renderHook(() => useWindowParam());
        expect(result.current).toHaveProperty('isOnline');
        expect(typeof result.current.isOnline).toBe('boolean');
    });

    it('should return localhost status', () => {
        const { result } = renderHook(() => useWindowParam());
        expect(result.current).toHaveProperty('isLocalhost');
        expect(typeof result.current.isLocalhost).toBe('boolean');
    });

    it('should return demo status', () => {
        const { result } = renderHook(() => useWindowParam());
        expect(result.current).toHaveProperty('isDemo');
        expect(typeof result.current.isDemo).toBe('boolean');
    });
});
