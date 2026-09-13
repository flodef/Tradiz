import { getPublicKey } from './processData';

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
