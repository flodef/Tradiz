import { useWindowParam } from '../hooks/useWindowParam';
import { Size } from './types';

interface ScreenSizeConfigItem {
    height: number;
    tailwindClass: string;
    rowHeight: number;
    numPadBottom: number;
}

export function createScreenSizeConfig(baseHeight: number): ScreenSizeConfigItem {
    return {
        height: baseHeight,
        tailwindClass: `h-${baseHeight}`,
        rowHeight: baseHeight * 4 + 1,
        numPadBottom: baseHeight * 12 + 15,
    };
}

export const SCREEN_SIZE_CONFIG = {
    xs: createScreenSizeConfig(11),
    sm: createScreenSizeConfig(12),
    md: createScreenSizeConfig(13),
    lg: createScreenSizeConfig(14),
    xl: createScreenSizeConfig(15),
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
    if (height <= 667) return 'xs';
    if (height <= 768) return 'sm';
    if (height <= 896) return 'md';
    if (height <= 1024) return 'lg';
    return 'xl';
};

export const getScreenSizeConfig = (height: number) => SCREEN_SIZE_CONFIG[getScreenHeight(height)];

// Hook version: returns screen size config with hydration safety (avoids SSR mismatch)
export const useScreenSizeConfig = () => {
    const { height } = useWindowParam();

    return SCREEN_SIZE_CONFIG[getScreenHeight(height)];
};
