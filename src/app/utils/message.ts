import { USE_DIGICARTE } from './constants';
import { CustomerDisplayPayload } from './customerDisplay';

export const CLOSE = 'CLOSE_CAISSE';
export const REFRESH = 'REFRESH_ORDERS';
export const CUSTOMER_DISPLAY = 'CUSTOMER_DISPLAY';

function post(type: string, payload?: unknown) {
    if (window.parent && window.parent !== window) {
        // Use wildcard for cross-origin communication to avoid origin mismatch errors
        // This is safe because we're only sending simple message types
        window.parent.postMessage({ type, payload }, '*');
    }
}

// DigiCarte-specific host messages (closing the cashier, refreshing orders).
export function postMessageToParent(type: string, payload?: unknown) {
    if (!USE_DIGICARTE) return;
    post(type, payload);
}

// The customer-facing backscreen is driven by the host regardless of the DigiCarte integration:
// always try to push, and stay silent when there is no host to receive it.
// In Electron, route through IPC to the main process which drives the serial LCD display.
export function postCustomerDisplay(payload: CustomerDisplayPayload) {
    if (typeof window !== 'undefined' && window.electronAPI?.sendCustomerDisplay) {
        window.electronAPI.sendCustomerDisplay(payload);
        return;
    }
    post(CUSTOMER_DISPLAY, payload);
}
