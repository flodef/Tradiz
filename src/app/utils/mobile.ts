import { useCallback, useEffect, useRef, useState } from 'react';
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

// Hook version: returns false on SSR, real value after hydration (avoids hydration mismatch)
export function useIsMobileDevice() {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        setIsMobile(isMobileDevice());
    }, []);
    return isMobile;
}

// Detects if the screen size is a mobile size (does not update on screen resize - use useIsMobile instead)
export function isMobileSize() {
    return typeof window === 'undefined' || window.screen.availWidth < 768;
}

// Detects if the screen size is a mobile size (update on screen resize)
export function useIsMobile() {
    return useWindowParam().width < 768;
}

// Detects if the device supports touch input. On Windows touchscreen POS units,
// this is true even though the browser reports as desktop (no "mobi" in UA),
// which means the browser won't synthesise context-menu events from long-press.
export function isTouchDevice() {
    return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * Returns touch event handlers that simulate a long-press → context-menu action
 * for touchscreen devices where the browser doesn't synthesise it (e.g. Windows
 * touchscreen desktops). Spread the returned handlers alongside `onContextMenu`.
 *
 * On non-touch devices the handlers are no-ops, so normal right-click still works.
 */
export function useLongPressContextMenu(onContextMenu: () => void) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startPosRef = useRef<{ x: number; y: number } | null>(null);
    // Prevent the click that follows touchend from also firing after a long-press.
    const suppressClickRef = useRef(false);

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        startPosRef.current = null;
    }, []);

    const onTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            startPosRef.current = { x: touch.clientX, y: touch.clientY };
            suppressClickRef.current = false;
            timerRef.current = setTimeout(() => {
                onContextMenu();
                suppressClickRef.current = true;
            }, LONG_PRESS_MS);
        },
        [onContextMenu]
    );

    const onTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!startPosRef.current || !timerRef.current) return;
            const touch = e.touches[0];
            const dx = touch.clientX - startPosRef.current.x;
            const dy = touch.clientY - startPosRef.current.y;
            if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) clearTimer();
        },
        [clearTimer]
    );

    const onTouchEnd = useCallback(() => {
        clearTimer();
    }, [clearTimer]);

    const onClickCapture = useCallback((e: React.MouseEvent) => {
        // If we just fired a long-press, swallow the subsequent click.
        if (suppressClickRef.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClickRef.current = false;
        }
    }, []);

    return { onTouchStart, onTouchMove, onTouchEnd, onClickCapture };
}
