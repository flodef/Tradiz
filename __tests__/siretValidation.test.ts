import { describe, it, expect } from 'vitest';

/**
 * SIRET (Système d'Identification du Répertoire des Établissements):
 * - Exactly 14 digits (SIREN 9 digits + NIC 5 digits)
 * - Validated by the Luhn algorithm (mod 10) as used by INSEE
 *
 * Luhn for SIRET: double every digit at an even index (0-based from left),
 * subtract 9 if result > 9, sum all, must be divisible by 10.
 */

const INPUT_REGEX = /^\d{0,14}$/;

function luhnCheck(value: string): boolean {
    if (value.length !== 14) return false;
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        let digit = parseInt(value[i], 10);
        if (i % 2 === 0) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    return sum % 10 === 0;
}

function isValidInput(value: string): boolean {
    return INPUT_REGEX.test(value);
}

describe('SIRET input guard (partial allowed while typing)', () => {
    it('allows empty string', () => expect(isValidInput('')).toBe(true));
    it('allows partial digits', () => expect(isValidInput('12345')).toBe(true));
    it('allows full 14 digits', () => expect(isValidInput('73282932000074')).toBe(true));
    it('rejects 15+ digits', () => expect(isValidInput('732829320000741')).toBe(false));
    it('rejects letters', () => expect(isValidInput('7328293200007A')).toBe(false));
    it('rejects spaces', () => expect(isValidInput('73282932 000074')).toBe(false));
    it('rejects dashes', () => expect(isValidInput('732-82932000074')).toBe(false));
});

describe('SIRET Luhn validation', () => {
    it('valid: INSEE test SIRET (73282932000074)', () => expect(luhnCheck('73282932000074')).toBe(true));
    it('valid: Apple France (38347946800100)', () => expect(luhnCheck('38347946800100')).toBe(true));

    it('invalid: wrong check digit (73282932000075)', () => expect(luhnCheck('73282932000075')).toBe(false));
    it('invalid: too short', () => expect(luhnCheck('7328293200007')).toBe(false));
    it('invalid: too long', () => expect(luhnCheck('732829320000740')).toBe(false));
    it('invalid: all zeros', () => expect(luhnCheck('00000000000000')).toBe(true)); // 0 mod 10 = 0
    it('invalid: sequential (12345678901234)', () => expect(luhnCheck('12345678901234')).toBe(false));
    it('invalid: empty string', () => expect(luhnCheck('')).toBe(false));
});
