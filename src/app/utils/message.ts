import { USE_DIGICARTE } from './constants';

export const CLOSE = 'CLOSE_CAISSE';
export const REFRESH = 'REFRESH_ORDERS';

export function postMessageToParent(type: string) {
    if (!USE_DIGICARTE) return;
    if (window.parent && window.parent !== window) {
        // Use wildcard for cross-origin communication to avoid origin mismatch errors
        // This is safe because we're only sending simple message types
        window.parent.postMessage({ type }, '*');
    }
}
