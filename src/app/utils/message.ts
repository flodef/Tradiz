import { USE_DIGICARTE, WEB_URL } from './constants';

export const CLOSE = 'CLOSE_CAISSE';
export const REFRESH = 'REFRESH_ORDERS';

export function postMessageToParent(type: string) {
    if (!USE_DIGICARTE) return;
    if (window.parent && window.parent !== window) window.parent.postMessage({ type }, WEB_URL || '*');
}
