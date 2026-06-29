import { useWindowParam } from '../hooks/useWindowParam';
import { Size } from './types';

export const SCREEN_SIZE_CONFIG = {
    xs: {
        height: 11, // h-11 (44px)
        tailwindClass: 'h-11',
        rowHeight: 45, // 44px + 1px divider
        numPadBottom: 135,
    },
    sm: {
        height: 12, // h-12 (48px)
        tailwindClass: 'h-12',
        rowHeight: 49, // 48px + 1px divider
        numPadBottom: 145,
    },
    md: {
        height: 13, // h-13 (52px)
        tailwindClass: 'h-13',
        rowHeight: 53, // 52px + 1px divider
        numPadBottom: 155,
    },
    lg: {
        height: 14, // h-14 (56px)
        tailwindClass: 'h-14',
        rowHeight: 57, // 56px + 1px divider
        numPadBottom: 165,
    },
    xl: {
        height: 15, // h-15 (60px)
        tailwindClass: 'h-15',
        rowHeight: 61, // 60px + 1px divider
        numPadBottom: 175,
    },
} as const;

export type ScreenSizeConfig = (typeof SCREEN_SIZE_CONFIG)[Size];

// Get screen size from screen width (Tailwind breakpoints: sm: 640px, md: 768px, lg: 1024px, xl: 1280px)
export const getScreenWidth = (width: number): Size => {
    if (width === -1) return 'xl';
    if (width < 640) return 'xs';
    if (width < 768) return 'sm';
    if (width < 1024) return 'md';
    if (width < 1280) return 'lg';
    return 'xl';
};

// Get screen size from screen height (custom breakpoints: iPhone SE 667px = xs, iPad Pro 1024px = xl)
export const getScreenHeight = (height: number): Size => {
    // SSR case: height is -1, default to xl
    if (height === -1) return 'xl';
    if (height < 667) return 'xs';
    if (height < 768) return 'sm';
    if (height < 896) return 'md';
    if (height < 1024) return 'lg';
    return 'xl';
};

export const getScreenSizeConfig = (height: number) => SCREEN_SIZE_CONFIG[getScreenHeight(height)];

// Hook version: returns screen size config with hydration safety (avoids SSR mismatch)
export const useScreenSizeConfig = () => {
    const { height } = useWindowParam();

    return SCREEN_SIZE_CONFIG[getScreenHeight(height)];
};
