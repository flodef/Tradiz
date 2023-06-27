// import { useMediaQuery } from 'react-responsive';

export function isMobileDevice() {
    return (
        typeof window !== 'undefined' &&
        window.isSecureContext &&
        typeof document !== 'undefined' &&
        /mobi|android/i.test(navigator.userAgent)
    );
}

// export function useIsMobileSize() {
//     return useMediaQuery({ query: '(max-width: 767px)' });
// }
