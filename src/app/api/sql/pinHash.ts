import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

const KEY_LEN = 32;

/**
 * Hash a user PIN with scrypt + a random salt.
 * Stored format: `<salt hex>:<hash hex>` — the plain PIN is never persisted.
 */
export async function hashPin(pin: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await new Promise<Buffer>((resolve, reject) =>
        scrypt(pin, salt, KEY_LEN, (err, key) => (err ? reject(err) : resolve(key)))
    );
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Constant-time PIN verification against a stored `salt:hash`. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    if (expected.length !== KEY_LEN) return false;
    const actual = await new Promise<Buffer>((resolve, reject) =>
        scrypt(pin, Buffer.from(saltHex, 'hex'), KEY_LEN, (err, key) => (err ? reject(err) : resolve(key)))
    );
    return timingSafeEqual(actual, expected);
}
