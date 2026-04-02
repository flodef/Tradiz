import { describe, it, expect } from 'vitest';

/**
 * Non-regression tests for French ZIP code validation (Code postal).
 *
 * French ZIP codes (codes postaux):
 * - Exactly 5 digits
 * - Digits only (no letters, no spaces, no dashes)
 * - Range: 01000–98890 (including DOM-TOM like 97xxx, 98xxx)
 * - Special: 2A/2B (Corse) are handled at the commune level, not ZIP level
 *
 * The input enforces /^\d{0,5}$/ while typing (allows partial),
 * and validates completeness with /^\d{5}$/.
 */

const INPUT_REGEX = /^\d{0,5}$/;    // allows partial while typing
const VALID_REGEX = /^\d{5}$/;       // complete valid ZIP

function isValidInput(value: string): boolean {
    return INPUT_REGEX.test(value);
}

function isValidZip(value: string): boolean {
    return VALID_REGEX.test(value);
}

describe('French ZIP code: input guard (partial allowed while typing)', () => {
    it('allows empty string', () => expect(isValidInput('')).toBe(true));
    it('allows partial 1-digit', () => expect(isValidInput('7')).toBe(true));
    it('allows partial 3-digit', () => expect(isValidInput('750')).toBe(true));
    it('allows full 5-digit ZIP', () => expect(isValidInput('75001')).toBe(true));
    it('rejects 6+ digits', () => expect(isValidInput('750011')).toBe(false));
    it('rejects letters', () => expect(isValidInput('7500A')).toBe(false));
    it('rejects spaces', () => expect(isValidInput('750 0')).toBe(false));
    it('rejects dashes', () => expect(isValidInput('750-0')).toBe(false));
});

describe('French ZIP code: full validity check', () => {
    it('valid: Paris 1er', () => expect(isValidZip('75001')).toBe(true));
    it('valid: Lyon', () => expect(isValidZip('69001')).toBe(true));
    it('valid: Marseille', () => expect(isValidZip('13001')).toBe(true));
    it('valid: Guadeloupe (DOM)', () => expect(isValidZip('97100')).toBe(true));
    it('valid: Polynésie (TOM)', () => expect(isValidZip('98700')).toBe(true));
    it('valid: leading-zero depts (Ain)', () => expect(isValidZip('01000')).toBe(true));

    it('invalid: empty', () => expect(isValidZip('')).toBe(false));
    it('invalid: 4 digits', () => expect(isValidZip('7500')).toBe(false));
    it('invalid: 6 digits', () => expect(isValidZip('750011')).toBe(false));
    it('invalid: letters', () => expect(isValidZip('7500A')).toBe(false));
    it('invalid: spaces', () => expect(isValidZip('750 01')).toBe(false));
    it('invalid: alphanumeric (UK style)', () => expect(isValidZip('SW1A1')).toBe(false));
});
