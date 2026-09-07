import { computeTransactionHash } from '@/app/utils/transactionHash';
import { generateTransactionHash } from '@/app/api/sql/saveTransaction/route';
import { describe, it, expect } from 'vitest';

describe('computeTransactionHash — regression tests', () => {
    const baseTx = {
        order_id: '12345',
        user_name: 'TestUser',
        payment_method: 'CB',
        amount: 10.5,
        currency: 'EUR',
        created_at: '2026-05-16 12:00:00',
        change: '',
        device_id: null,
    };

    it('produces a deterministic hash for a fixed input (pins the format)', () => {
        const hash = computeTransactionHash(baseTx);
        expect(hash).toBe('85351acd6e622cb4168dde0deeb0a8dabd785d8fbe9961221d73d072db207e6c');
    });

    it('produces a deterministic hash with transactionId', () => {
        const hash = computeTransactionHash(baseTx, 42);
        expect(hash).toBe('980e4e0f8539c17b5f5aa01615025c042b0d4b909f28fd19e62568e11dc7ae0b');
    });

    it('produces a deterministic hash with transactionId and previousHash', () => {
        const hash = computeTransactionHash(baseTx, 42, 'abc123previoushash');
        expect(hash).toBe('13dc73cebcd1c29bc8c09a79965b4b74e75523bf5e4650a471fddbd92b1b4bfd');
    });

    it('normalizes amount via Number() — "12.50" and 12.5 produce the same hash', () => {
        const txString = { ...baseTx, amount: '12.50' as unknown as number };
        const txNumber = { ...baseTx, amount: 12.5 };
        expect(computeTransactionHash(txString, 1)).toBe(computeTransactionHash(txNumber, 1));
    });

    it('generateTransactionHash (saveTransaction re-export) matches computeTransactionHash', () => {
        const tx = { ...baseTx, updated_at: '2026-05-16 12:00:00', note: '' };
        expect(generateTransactionHash(tx, 42, 'prev')).toBe(computeTransactionHash(tx, 42, 'prev'));
    });

    it('hash is unchanged when payments is absent or empty (legacy compat)', () => {
        const hashNoPayments = computeTransactionHash(baseTx, 1);
        const hashEmptyPayments = computeTransactionHash({ ...baseTx, payments: [] }, 1);
        expect(hashEmptyPayments).toBe(hashNoPayments);
    });

    it('hash changes when payments legs are present', () => {
        const hashNoPayments = computeTransactionHash(baseTx, 1);
        const hashWithPayments = computeTransactionHash(
            {
                ...baseTx,
                payment_method: 'MULTIPLE',
                payments: [
                    { method: 'Espèces', amount: 5 },
                    { method: 'Carte Bancaire', amount: 5.5 },
                ],
            },
            1
        );
        expect(hashWithPayments).not.toBe(hashNoPayments);
    });

    it('hash with payments is deterministic (pins the format)', () => {
        const hash = computeTransactionHash(
            {
                ...baseTx,
                payment_method: 'MULTIPLE',
                payments: [
                    { method: 'Espèces', amount: 5 },
                    { method: 'Carte Bancaire', amount: 5.5 },
                ],
            },
            1
        );
        // Updated: payment legs are now sorted by method then amount for
        // deterministic ordering, matching the items treatment.
        expect(hash).toBe('6811cb42d5c963880f28a25223b1ea688c43a232c9bfd1789b73065d0464b1e6');
    });

    it('payment legs are order-independent (canonical sorting by method then amount)', () => {
        const legsOrder1 = [
            { method: 'Espèces', amount: 5 },
            { method: 'Carte Bancaire', amount: 5.5 },
        ];
        const legsOrder2 = [
            { method: 'Carte Bancaire', amount: 5.5 },
            { method: 'Espèces', amount: 5 },
        ];
        expect(computeTransactionHash({ ...baseTx, payment_method: 'MULTIPLE', payments: legsOrder1 }, 1)).toBe(
            computeTransactionHash({ ...baseTx, payment_method: 'MULTIPLE', payments: legsOrder2 }, 1)
        );
    });

    it('delimiter injection in item labels produces distinct digests (no collision)', () => {
        // Two different item sets that would collide under the old
        // comma/semicolon delimiters without escaping.
        const itemsA = [{ label: 'Café,grand', quantity: 1, amount: 2.5, total: 2.5, vat_rate: 20 }];
        const itemsB = [
            { label: 'Café', quantity: 1, amount: 2.5, total: 2.5, vat_rate: 20 },
            { label: 'grand', quantity: 1, amount: 0, total: 0, vat_rate: 20 },
        ];
        expect(computeTransactionHash({ ...baseTx, items: itemsA }, 1)).not.toBe(
            computeTransactionHash({ ...baseTx, items: itemsB }, 1)
        );
    });

    it('delimiter injection in item labels with semicolons produces distinct digests', () => {
        const itemsA = [{ label: 'Thé;vert', quantity: 2, amount: 3, total: 6, vat_rate: 10 }];
        const itemsB = [
            { label: 'Thé', quantity: 2, amount: 3, total: 6, vat_rate: 10 },
            { label: 'vert', quantity: 0, amount: 0, total: 0, vat_rate: 0 },
        ];
        expect(computeTransactionHash({ ...baseTx, items: itemsA }, 1)).not.toBe(
            computeTransactionHash({ ...baseTx, items: itemsB }, 1)
        );
    });

    it('backslash in label is escaped and does not break the digest', () => {
        const itemsA = [{ label: 'Café\\,grand', quantity: 1, amount: 2.5, total: 2.5, vat_rate: 20 }];
        const itemsB = [{ label: 'Café,grand', quantity: 1, amount: 2.5, total: 2.5, vat_rate: 20 }];
        expect(computeTransactionHash({ ...baseTx, items: itemsA }, 1)).not.toBe(
            computeTransactionHash({ ...baseTx, items: itemsB }, 1)
        );
    });

    it('pipe in label is escaped and does not break the top-level delimiter', () => {
        const itemsA = [{ label: 'Café|grand', quantity: 1, amount: 2.5, total: 2.5, vat_rate: 20 }];
        const itemsB = [{ label: 'Café', quantity: 1, amount: 2.5, total: 2.5, vat_rate: 20 }];
        expect(computeTransactionHash({ ...baseTx, items: itemsA }, 1)).not.toBe(
            computeTransactionHash({ ...baseTx, items: itemsB }, 1)
        );
    });

    it('delimiter injection in payment method names produces distinct digests', () => {
        const paymentsA = [{ method: 'Carte,Bancaire', amount: 5 }];
        const paymentsB = [
            { method: 'Carte', amount: 5 },
            { method: 'Bancaire', amount: 0 },
        ];
        expect(computeTransactionHash({ ...baseTx, payment_method: 'MULTIPLE', payments: paymentsA }, 1)).not.toBe(
            computeTransactionHash({ ...baseTx, payment_method: 'MULTIPLE', payments: paymentsB }, 1)
        );
    });

    it('unicode labels are handled correctly', () => {
        const items = [{ label: 'Café ☕ émoji', quantity: 1, amount: 2.5, total: 2.5, vat_rate: 20 }];
        const hash = computeTransactionHash({ ...baseTx, items }, 1);
        expect(hash).toHaveLength(64);
        // Re-computing produces the same hash (deterministic)
        expect(computeTransactionHash({ ...baseTx, items }, 1)).toBe(hash);
    });

    it('generateTransactionHash includes payments in hash (regression: was missing payments)', () => {
        const txWithoutPayments = {
            ...baseTx,
            payment_method: 'MULTIPLE',
            updated_at: '2026-05-16 12:00:00',
        };
        const txWithPayments = {
            ...baseTx,
            payment_method: 'MULTIPLE',
            updated_at: '2026-05-16 12:00:00',
            payments: [
                { method: 'Espèces', amount: 5 },
                { method: 'Carte Bancaire', amount: 5.5 },
            ],
        };
        expect(generateTransactionHash(txWithPayments, 1)).not.toBe(generateTransactionHash(txWithoutPayments, 1));
    });

    it('generateTransactionHash with payments matches computeTransactionHash with payments', () => {
        const payments = [
            { method: 'Espèces', amount: 5 },
            { method: 'Carte Bancaire', amount: 5.5 },
        ];
        const tx = {
            ...baseTx,
            payment_method: 'MULTIPLE',
            updated_at: '2026-05-16 12:00:00',
            payments,
        };
        expect(generateTransactionHash(tx, 42, 'prev')).toBe(
            computeTransactionHash({ ...baseTx, payment_method: 'MULTIPLE', payments }, 42, 'prev')
        );
    });

    it('VAT mismatch fix: missing vat_rate is normalized to DEFAULT_VAT_RATE (20) in the hash', () => {
        // This is the critical fix: previously, a product with no vat_rate was
        // hashed as VAT 0 but persisted as VAT 20 (DEFAULT_VAT_RATE), making
        // the transaction unverifiable. Now generateTransactionHash normalizes
        // the product to its persisted form before hashing.
        const txWithoutVat = {
            ...baseTx,
            updated_at: '2026-05-16 12:00:00',
            products: [{ label: 'Café', category: 'Boissons', amount: 2.5, quantity: 1, total: 2.5 }],
        };
        const txWithVat20 = {
            ...baseTx,
            updated_at: '2026-05-16 12:00:00',
            products: [{ label: 'Café', category: 'Boissons', amount: 2.5, quantity: 1, total: 2.5, vat_rate: 20 }],
        };
        // generateTransactionHash normalizes both to the same persisted form
        expect(generateTransactionHash(txWithoutVat, 1)).toBe(generateTransactionHash(txWithVat20, 1));
    });

    it('VAT mismatch fix: hash matches what verifyIntegrity would compute from DB values', () => {
        // Simulate the verifyIntegrity path: items read from DB have vat_rate
        // = DEFAULT_VAT_RATE (20) because that's what was INSERTed.
        const txToSave = {
            ...baseTx,
            updated_at: '2026-05-16 12:00:00',
            products: [{ label: 'Café', category: 'Boissons', amount: 2.5, quantity: 1, total: 2.5 }],
        };
        // What verifyIntegrity would re-read from the DB (vat_rate = 20)
        const itemsFromDb = [{ label: 'Café', quantity: 1, amount: 2.5, total: 2.5, vat_rate: 20 }];
        expect(generateTransactionHash(txToSave, 1)).toBe(computeTransactionHash({ ...baseTx, items: itemsFromDb }, 1));
    });

    it('VAT mismatch fix: explicit vat_rate=0 is preserved (not replaced with 20)', () => {
        const txWithVat0 = {
            ...baseTx,
            updated_at: '2026-05-16 12:00:00',
            products: [{ label: 'Café', category: 'Boissons', amount: 2.5, quantity: 1, total: 2.5, vat_rate: 0 }],
        };
        const txWithVat20 = {
            ...baseTx,
            updated_at: '2026-05-16 12:00:00',
            products: [{ label: 'Café', category: 'Boissons', amount: 2.5, quantity: 1, total: 2.5, vat_rate: 20 }],
        };
        // Explicit 0 should NOT be replaced with 20
        expect(generateTransactionHash(txWithVat0, 1)).not.toBe(generateTransactionHash(txWithVat20, 1));
    });
});
