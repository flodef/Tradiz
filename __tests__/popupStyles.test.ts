import { describe, expect, it } from 'vitest';
import {
    adminPopupStyles,
    defaultPopupStyles,
    getDesktopContainerStyles,
    getOptionHoverStyles,
    getPopupStyles,
} from '../src/app/utils/popupStyles';

describe('popupStyles', () => {
    describe('defaultPopupStyles', () => {
        it('has all required style properties', () => {
            expect(defaultPopupStyles).toHaveProperty('container');
            expect(defaultPopupStyles).toHaveProperty('overlay');
            expect(defaultPopupStyles).toHaveProperty('header');
            expect(defaultPopupStyles).toHaveProperty('title');
            expect(defaultPopupStyles).toHaveProperty('option');
            expect(defaultPopupStyles).toHaveProperty('optionText');
            expect(defaultPopupStyles).toHaveProperty('separator');
        });

        it('has non-empty style strings', () => {
            Object.values(defaultPopupStyles).forEach((style) => {
                expect(typeof style).toBe('string');
                expect(style.length).toBeGreaterThan(0);
            });
        });
    });

    describe('adminPopupStyles', () => {
        it('has all required style properties', () => {
            expect(adminPopupStyles).toHaveProperty('container');
            expect(adminPopupStyles).toHaveProperty('overlay');
            expect(adminPopupStyles).toHaveProperty('header');
            expect(adminPopupStyles).toHaveProperty('title');
            expect(adminPopupStyles).toHaveProperty('option');
            expect(adminPopupStyles).toHaveProperty('optionText');
            expect(adminPopupStyles).toHaveProperty('separator');
        });

        it('has non-empty style strings', () => {
            Object.values(adminPopupStyles).forEach((style) => {
                expect(typeof style).toBe('string');
                expect(style.length).toBeGreaterThan(0);
            });
        });
    });

    describe('getPopupStyles', () => {
        it('returns default styles when variant is default', () => {
            const result = getPopupStyles('default');
            expect(result).toEqual(defaultPopupStyles);
        });

        it('returns admin styles when variant is admin', () => {
            const result = getPopupStyles('admin');
            expect(result).toEqual(adminPopupStyles);
        });

        it('returns default styles when no variant is provided', () => {
            const result = getPopupStyles();
            expect(result).toEqual(defaultPopupStyles);
        });
    });

    describe('getDesktopContainerStyles', () => {
        it('returns empty string when fullscreen is true', () => {
            const result = getDesktopContainerStyles(true);
            expect(result).toBe('');
        });

        it('returns desktop styles when fullscreen is false', () => {
            const result = getDesktopContainerStyles(false);
            expect(result).toContain('md:');
            expect(result).toContain('md:border-0');
            expect(result).toContain('md:w-1/2');
        });
    });

    describe('getOptionHoverStyles', () => {
        it('returns empty string when isMobileDevice is true', () => {
            const result = getOptionHoverStyles(true, true);
            expect(result).toBe('');
        });

        it('returns empty string when isStringOption is false', () => {
            const result = getOptionHoverStyles(false, false);
            expect(result).toBe('');
        });

        it('returns hover styles when isMobileDevice is false and isStringOption is true', () => {
            const result = getOptionHoverStyles(false, true);
            expect(result).toContain('hover:');
            expect(result).toContain('active:');
        });

        it('returns empty string when both conditions are false', () => {
            const result = getOptionHoverStyles(true, false);
            expect(result).toBe('');
        });
    });
});
