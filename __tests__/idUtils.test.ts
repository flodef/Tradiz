import { describe, expect, it } from 'vitest';
import {
    containsId,
    formatId,
    generateSimpleId,
    getConnectedDevices,
    getDevices,
    isNewDevice,
} from '../src/app/utils/id';

describe('generateSimpleId', () => {
    it('generates a non-empty string', () => {
        const id = generateSimpleId();
        expect(id).toBeTruthy();
        expect(typeof id).toBe('string');
    });

    it('generates different IDs on each call', () => {
        const id1 = generateSimpleId();
        const id2 = generateSimpleId();
        expect(id1).not.toBe(id2);
    });

    it('generates IDs with reasonable length', () => {
        const id = generateSimpleId();
        expect(id.length).toBeGreaterThan(10);
        expect(id.length).toBeLessThan(30);
    });
});

describe('formatId', () => {
    it('returns ID unchanged if length <= 8', () => {
        expect(formatId('abc123')).toBe('abc123');
        expect(formatId('12345678')).toBe('12345678');
    });

    it('removes NEW_ID_CHAR from short IDs', () => {
        expect(formatId('$abc123')).toBe('abc123');
    });

    it('truncates long IDs and adds ellipsis', () => {
        const longId = 'abcdefghijklmnopqrstuvwxyz';
        const result = formatId(longId);
        expect(result).toBe('abcd...wxyz');
    });

    it('removes NEW_ID_CHAR from long IDs before formatting', () => {
        const longId = '$abcdefghijklmnopqrstuvwxyz';
        const result = formatId(longId);
        expect(result).toBe('abcd...wxyz');
    });

    it('handles edge case of exactly 8 characters', () => {
        expect(formatId('12345678')).toBe('12345678');
    });

    it('handles edge case of 9 characters', () => {
        const result = formatId('123456789');
        expect(result).toBe('1234...6789');
    });
});

describe('containsId', () => {
    it('returns true when ID is in list', () => {
        expect(containsId(['abc123', 'def456'], 'abc123')).toBe(true);
    });

    it('returns false when ID is not in list', () => {
        expect(containsId(['abc123', 'def456'], 'xyz789')).toBe(false);
    });

    it('handles IDs with NEW_ID_CHAR', () => {
        expect(containsId(['$abc123', 'def456'], 'abc123')).toBe(true);
        expect(containsId(['abc123', 'def456'], '$abc123')).toBe(true);
    });

    it('handles empty list', () => {
        expect(containsId([], 'abc123')).toBe(false);
    });

    it('handles empty ID', () => {
        expect(containsId(['abc123'], '')).toBe(false);
    });
});

describe('isNewDevice', () => {
    it('returns true for IDs starting with NEW_ID_CHAR', () => {
        expect(isNewDevice('$abc123')).toBe(true);
    });

    it('returns false for normal IDs', () => {
        expect(isNewDevice('abc123')).toBe(false);
    });

    it('returns false for empty string', () => {
        expect(isNewDevice('')).toBe(false);
    });

    it('returns false for ID with NEW_ID_CHAR in middle', () => {
        expect(isNewDevice('abc$123')).toBe(false);
    });
});

describe('getConnectedDevices', () => {
    it('filters out new devices (IDs starting with $)', () => {
        const ids = ['abc123', '$def456', 'ghi789'];
        const result = getConnectedDevices(ids);
        expect(result).toEqual(['abc123', 'ghi789']);
    });

    it('returns empty array if all devices are new', () => {
        const ids = ['$abc123', '$def456'];
        const result = getConnectedDevices(ids);
        expect(result).toEqual([]);
    });

    it('returns all devices if none are new', () => {
        const ids = ['abc123', 'def456', 'ghi789'];
        const result = getConnectedDevices(ids);
        expect(result).toEqual(['abc123', 'def456', 'ghi789']);
    });

    it('handles empty array', () => {
        const result = getConnectedDevices([]);
        expect(result).toEqual([]);
    });
});

describe('getDevices', () => {
    it('adds new device to list when isNewDevice is true', () => {
        const ids = ['abc123', 'def456'];
        const result = getDevices(ids, 'ghi789', true);
        expect(result).toEqual(['abc123', 'def456', '$ghi789']);
    });

    it('adds normal device to list when isNewDevice is false', () => {
        const ids = ['abc123', 'def456'];
        const result = getDevices(ids, 'ghi789', false);
        expect(result).toEqual(['abc123', 'def456', 'ghi789']);
    });

    it('removes existing user ID and adds it back (no duplicates)', () => {
        const ids = ['abc123', 'def456'];
        const result = getDevices(ids, 'abc123', false);
        expect(result).toEqual(['def456', 'abc123']);
    });

    it('handles empty list with new device', () => {
        const result = getDevices([], 'abc123', true);
        expect(result).toEqual(['abc123']);
    });

    it('handles empty list with normal device', () => {
        const result = getDevices([], 'abc123', false);
        expect(result).toEqual(['abc123']);
    });

    it('defaults isNewDevice to false', () => {
        const ids = ['abc123', 'def456'];
        const result = getDevices(ids, 'ghi789');
        expect(result).toEqual(['abc123', 'def456', 'ghi789']);
    });
});
