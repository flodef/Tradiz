import { useWindowParam } from '../hooks/useWindowParam';

// Detects if the device is a mobile
export function isMobileDevice() {
    return (
        typeof window !== 'undefined' &&
        window.isSecureContext &&
        typeof document !== 'undefined' &&
        /mobi|android/i.test(navigator.userAgent)
    );
}

// Detects if the screen size is a mobile size (does not update on screen resize - use useIsMobile instead)
export function isMobileSize() {
    return typeof window === 'undefined' || window.screen.availWidth < 768;
}

// Detects if the screen size is a mobile size (update on screen resize)
export function useIsMobile() {
    return useWindowParam().width < 768;
}
