import { describe, it, expect } from 'vitest';
import { generateSimpleId } from '../src/app/utils/id';

describe('generateSimpleId', () => {
    it('should generate a string', () => {
        const id = generateSimpleId();
        expect(typeof id).toBe('string');
    });

    it('should generate different IDs on each call', () => {
        const id1 = generateSimpleId();
        const id2 = generateSimpleId();
        expect(id1).not.toBe(id2);
    });

    it('should generate IDs with reasonable length', () => {
        const id = generateSimpleId();
        expect(id.length).toBeGreaterThan(0);
        expect(id.length).toBeLessThan(50);
    });

    it('should generate IDs containing only alphanumeric characters', () => {
        const id = generateSimpleId();
        expect(id).toMatch(/^[a-zA-Z0-9]+$/);
    });
});
