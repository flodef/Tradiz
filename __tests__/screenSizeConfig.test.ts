import { describe, expect, it, vi } from 'vitest';
import {
    SCREEN_SIZE_CONFIG,
    getScreenSizeConfig,
    getScreenWidth,
    getScreenHeight,
    useScreenSizeConfig,
} from '../src/app/utils/screenSizeConfig';
import { renderHook } from '@testing-library/react';
import { ColorScheme } from '../src/app/hooks/useWindowParam';

vi.mock('../src/app/hooks/useWindowParam');

const { useWindowParam } = await import('../src/app/hooks/useWindowParam');
const mockedUseWindowParam = vi.mocked(useWindowParam);

describe('SCREEN_SIZE_CONFIG', () => {
    it('has all required size options', () => {
        expect(SCREEN_SIZE_CONFIG).toHaveProperty('xs');
        expect(SCREEN_SIZE_CONFIG).toHaveProperty('sm');
        expect(SCREEN_SIZE_CONFIG).toHaveProperty('md');
        expect(SCREEN_SIZE_CONFIG).toHaveProperty('lg');
        expect(SCREEN_SIZE_CONFIG).toHaveProperty('xl');
    });

    it('has correct structure for each size', () => {
        Object.values(SCREEN_SIZE_CONFIG).forEach((config) => {
            expect(config).toHaveProperty('height');
            expect(config).toHaveProperty('tailwindClass');
            expect(config).toHaveProperty('rowHeight');
            expect(config).toHaveProperty('numPadBottom');
            expect(typeof config.height).toBe('number');
            expect(typeof config.tailwindClass).toBe('string');
            expect(typeof config.rowHeight).toBe('number');
            expect(typeof config.numPadBottom).toBe('number');
        });
    });

    it('has correct tailwind class format', () => {
        expect(SCREEN_SIZE_CONFIG.xs.tailwindClass).toBe('h-11');
        expect(SCREEN_SIZE_CONFIG.sm.tailwindClass).toBe('h-12');
        expect(SCREEN_SIZE_CONFIG.md.tailwindClass).toBe('h-13');
        expect(SCREEN_SIZE_CONFIG.lg.tailwindClass).toBe('h-14');
        expect(SCREEN_SIZE_CONFIG.xl.tailwindClass).toBe('h-15');
    });

    it('has increasing heights from xs to xl', () => {
        expect(SCREEN_SIZE_CONFIG.xs.height).toBeLessThan(SCREEN_SIZE_CONFIG.sm.height);
        expect(SCREEN_SIZE_CONFIG.sm.height).toBeLessThan(SCREEN_SIZE_CONFIG.md.height);
        expect(SCREEN_SIZE_CONFIG.md.height).toBeLessThan(SCREEN_SIZE_CONFIG.lg.height);
        expect(SCREEN_SIZE_CONFIG.lg.height).toBeLessThan(SCREEN_SIZE_CONFIG.xl.height);
    });

    it('has increasing numPadBottom from xs to xl', () => {
        expect(SCREEN_SIZE_CONFIG.xs.numPadBottom).toBeLessThan(SCREEN_SIZE_CONFIG.sm.numPadBottom);
        expect(SCREEN_SIZE_CONFIG.sm.numPadBottom).toBeLessThan(SCREEN_SIZE_CONFIG.md.numPadBottom);
        expect(SCREEN_SIZE_CONFIG.md.numPadBottom).toBeLessThan(SCREEN_SIZE_CONFIG.lg.numPadBottom);
        expect(SCREEN_SIZE_CONFIG.lg.numPadBottom).toBeLessThan(SCREEN_SIZE_CONFIG.xl.numPadBottom);
    });
});

describe('getScreenWidth', () => {
    it('returns xl when width is -1 (SSR)', () => {
        expect(getScreenWidth(-1)).toBe('xl');
    });

    it('returns xs for width < 640', () => {
        expect(getScreenWidth(500)).toBe('xs');
    });

    it('returns sm for width 640-767', () => {
        expect(getScreenWidth(700)).toBe('sm');
    });

    it('returns md for width 768-1023', () => {
        expect(getScreenWidth(800)).toBe('md');
    });

    it('returns lg for width 1024-1279', () => {
        expect(getScreenWidth(1100)).toBe('lg');
    });

    it('returns xl for width >= 1280', () => {
        expect(getScreenWidth(1400)).toBe('xl');
    });
});

describe('getScreenHeight', () => {
    it('returns xs for height < 667 (iPhone SE)', () => {
        expect(getScreenHeight(600)).toBe('xs');
    });

    it('returns sm for height 667-767', () => {
        expect(getScreenHeight(700)).toBe('sm');
    });

    it('returns md for height 768-895', () => {
        expect(getScreenHeight(800)).toBe('md');
    });

    it('returns lg for height 896-1023', () => {
        expect(getScreenHeight(1000)).toBe('lg');
    });

    it('returns xl for height >= 1024 (iPad Pro)', () => {
        expect(getScreenHeight(1024)).toBe('xl');
    });
});

describe('getScreenSizeConfig', () => {
    it('returns xs config for small screen', () => {
        const result = getScreenSizeConfig(600);
        expect(result).toEqual(SCREEN_SIZE_CONFIG.xs);
    });

    it('returns sm config for sm screen', () => {
        const result = getScreenSizeConfig(700);
        expect(result).toEqual(SCREEN_SIZE_CONFIG.sm);
    });

    it('returns md config for md screen', () => {
        const result = getScreenSizeConfig(800);
        expect(result).toEqual(SCREEN_SIZE_CONFIG.md);
    });

    it('returns lg config for lg screen', () => {
        const result = getScreenSizeConfig(1000);
        expect(result).toEqual(SCREEN_SIZE_CONFIG.lg);
    });

    it('returns xl config for xl screen', () => {
        const result = getScreenSizeConfig(1024);
        expect(result).toEqual(SCREEN_SIZE_CONFIG.xl);
    });
});

describe('useScreenSizeConfig', () => {
    it('returns xl config when height is -1 (SSR)', () => {
        mockedUseWindowParam.mockReturnValue({
            height: -1,
            width: -1,
            top: 0,
            left: 0,
            colorScheme: ColorScheme.Light,
            isOnline: true,
            isLocalhost: false,
            isDemo: false,
        });
        const { result } = renderHook(() => useScreenSizeConfig());
        expect(result.current).toEqual(SCREEN_SIZE_CONFIG.xl);
    });

    it('returns xs config for small screen', () => {
        mockedUseWindowParam.mockReturnValue({
            height: 600,
            width: 375,
            top: 0,
            left: 0,
            colorScheme: ColorScheme.Light,
            isOnline: true,
            isLocalhost: false,
            isDemo: false,
        });
        const { result } = renderHook(() => useScreenSizeConfig());
        expect(result.current).toEqual(SCREEN_SIZE_CONFIG.xs);
    });

    it('returns xl config for large screen', () => {
        mockedUseWindowParam.mockReturnValue({
            height: 1024,
            width: 1366,
            top: 0,
            left: 0,
            colorScheme: ColorScheme.Light,
            isOnline: true,
            isLocalhost: false,
            isDemo: false,
        });
        const { result } = renderHook(() => useScreenSizeConfig());
        expect(result.current).toEqual(SCREEN_SIZE_CONFIG.xl);
    });
});
