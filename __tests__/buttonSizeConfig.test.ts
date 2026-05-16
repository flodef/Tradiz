import { describe, expect, it } from 'vitest';
import { BUTTON_SIZE_CONFIG, getButtonSizeConfig } from '../src/app/utils/buttonSizeConfig';

describe('BUTTON_SIZE_CONFIG', () => {
    it('has all required size options', () => {
        expect(BUTTON_SIZE_CONFIG).toHaveProperty('xs');
        expect(BUTTON_SIZE_CONFIG).toHaveProperty('sm');
        expect(BUTTON_SIZE_CONFIG).toHaveProperty('md');
        expect(BUTTON_SIZE_CONFIG).toHaveProperty('lg');
        expect(BUTTON_SIZE_CONFIG).toHaveProperty('xl');
    });

    it('has correct structure for each size', () => {
        Object.values(BUTTON_SIZE_CONFIG).forEach((config) => {
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
        expect(BUTTON_SIZE_CONFIG.xs.tailwindClass).toBe('h-10');
        expect(BUTTON_SIZE_CONFIG.sm.tailwindClass).toBe('h-11');
        expect(BUTTON_SIZE_CONFIG.md.tailwindClass).toBe('h-12');
        expect(BUTTON_SIZE_CONFIG.lg.tailwindClass).toBe('h-13');
        expect(BUTTON_SIZE_CONFIG.xl.tailwindClass).toBe('h-14');
    });

    it('has increasing heights from xs to xl', () => {
        expect(BUTTON_SIZE_CONFIG.xs.height).toBeLessThan(BUTTON_SIZE_CONFIG.sm.height);
        expect(BUTTON_SIZE_CONFIG.sm.height).toBeLessThan(BUTTON_SIZE_CONFIG.md.height);
        expect(BUTTON_SIZE_CONFIG.md.height).toBeLessThan(BUTTON_SIZE_CONFIG.lg.height);
        expect(BUTTON_SIZE_CONFIG.lg.height).toBeLessThan(BUTTON_SIZE_CONFIG.xl.height);
    });

    it('has rowHeight = height * 4 + 1 (for divider, converting tailwind to pixels)', () => {
        Object.values(BUTTON_SIZE_CONFIG).forEach((config) => {
            expect(config.rowHeight).toBe(config.height * 4 + 1);
        });
    });

    it('has increasing numPadBottom from xs to xl', () => {
        expect(BUTTON_SIZE_CONFIG.xs.numPadBottom).toBeLessThan(BUTTON_SIZE_CONFIG.sm.numPadBottom);
        expect(BUTTON_SIZE_CONFIG.sm.numPadBottom).toBeLessThan(BUTTON_SIZE_CONFIG.md.numPadBottom);
        expect(BUTTON_SIZE_CONFIG.md.numPadBottom).toBeLessThan(BUTTON_SIZE_CONFIG.lg.numPadBottom);
        expect(BUTTON_SIZE_CONFIG.lg.numPadBottom).toBeLessThan(BUTTON_SIZE_CONFIG.xl.numPadBottom);
    });
});

describe('getButtonSizeConfig', () => {
    it('returns correct config for xs', () => {
        const result = getButtonSizeConfig('xs');
        expect(result).toEqual(BUTTON_SIZE_CONFIG.xs);
    });

    it('returns correct config for sm', () => {
        const result = getButtonSizeConfig('sm');
        expect(result).toEqual(BUTTON_SIZE_CONFIG.sm);
    });

    it('returns correct config for md', () => {
        const result = getButtonSizeConfig('md');
        expect(result).toEqual(BUTTON_SIZE_CONFIG.md);
    });

    it('returns correct config for lg', () => {
        const result = getButtonSizeConfig('lg');
        expect(result).toEqual(BUTTON_SIZE_CONFIG.lg);
    });

    it('returns correct config for xl', () => {
        const result = getButtonSizeConfig('xl');
        expect(result).toEqual(BUTTON_SIZE_CONFIG.xl);
    });

    it('returns the same reference as BUTTON_SIZE_CONFIG', () => {
        const result = getButtonSizeConfig('md');
        expect(result).toBe(BUTTON_SIZE_CONFIG.md);
    });
});
