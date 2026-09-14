import { getPublicKey, peekPublicKey } from './processData';

/**
 * fetch() wrapper that identifies the calling device by sending its public
 * key in the `x-public-key` header (same convention as getDeviceHardware).
 * Required on all device-gated API routes — see api/sql/deviceAuth.ts.
 */
export function deviceFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('x-public-key', getPublicKey());
    return fetch(input, { ...init, headers });
}

/**
 * Like deviceFetch but only attaches the key when one already exists — never
 * mints a new device key. For calls mounted on public/anonymous pages
 * (e.g. VersionChecker in the root layout).
 */
export function deviceFetchIfKnown(input: string, init: RequestInit = {}): Promise<Response> {
    const key = peekPublicKey();
    if (!key) return fetch(input, init);
    const headers = new Headers(init.headers);
    headers.set('x-public-key', key);
    return fetch(input, { ...init, headers });
}
