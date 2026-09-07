import { sanitizeShopId } from '@/app/api/sql/attestation/route';
import { describe, it, expect } from 'vitest';

describe('sanitizeShopId', () => {
    it('passes through valid shop IDs', () => {
        expect(sanitizeShopId('annette')).toBe('annette');
        expect(sanitizeShopId('gds')).toBe('gds');
        expect(sanitizeShopId('shop-1')).toBe('shop-1');
        expect(sanitizeShopId('shop_2')).toBe('shop_2');
    });

    it('lowercases uppercase letters', () => {
        expect(sanitizeShopId('Annette')).toBe('annette');
        expect(sanitizeShopId('GDS')).toBe('gds');
    });

    it('replaces path traversal characters', () => {
        expect(sanitizeShopId('../etc/passwd')).toBe('___etc_passwd');
        expect(sanitizeShopId('..\\windows')).toBe('___windows');
    });

    it('replaces dots (prevents directory traversal)', () => {
        expect(sanitizeShopId('shop.name')).toBe('shop_name');
    });

    it('replaces slashes', () => {
        expect(sanitizeShopId('shop/sub')).toBe('shop_sub');
        expect(sanitizeShopId('shop\\sub')).toBe('shop_sub');
    });

    it('replaces special characters', () => {
        expect(sanitizeShopId('shop@name!')).toBe('shop_name_');
        expect(sanitizeShopId('shop name')).toBe('shop_name');
    });

    it('handles empty string with a default', () => {
        expect(sanitizeShopId('')).toBe('default');
    });

    it('handles strings with only invalid characters', () => {
        expect(sanitizeShopId('...')).toBe('___');
        expect(sanitizeShopId('///')).toBe('___');
    });

    it('produces distinct filenames for different shop IDs', () => {
        expect(sanitizeShopId('annette')).not.toBe(sanitizeShopId('gds'));
    });

    it('prevents collision between traversal and valid IDs', () => {
        // A traversal attempt must not sanitize to the same value as a valid shop ID
        expect(sanitizeShopId('../annette')).not.toBe(sanitizeShopId('annette'));
    });
});
