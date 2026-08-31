import { computeFidelityDelta } from '@/app/api/sql/saveTransaction/route';
import { REFUND_KEYWORD, WAITING_KEYWORD, DELETED_KEYWORD } from '@/app/utils/constants';
import { describe, it, expect } from 'vitest';

describe('computeFidelityDelta', () => {
    const FIDELITY_RATE = 10; // 10% earn rate

    it('earns points on normal payment', () => {
        // amount=100, rate=10% → earn 10 points
        const delta = computeFidelityDelta('Carte Bancaire', 100, 0, FIDELITY_RATE);
        expect(delta).toBe(10);
    });

    it('deducts earned points on refund', () => {
        // Refund: deduct |amount| * rate / 100 = 10
        const delta = computeFidelityDelta(REFUND_KEYWORD, 100, 0, FIDELITY_RATE);
        expect(delta).toBe(-10);
    });

    it('deducts used fidelity points on normal payment', () => {
        // Uses 5 fidelity points → delta = -5 (used) + 10 (earned) = 5
        const delta = computeFidelityDelta('Carte Bancaire', 100, 5, FIDELITY_RATE);
        expect(delta).toBe(5);
    });

    it('restores used fidelity points on refund', () => {
        // Refund with 5 points used: +5 (restore) - 10 (deduct earned) = -5
        const delta = computeFidelityDelta(REFUND_KEYWORD, 100, 5, FIDELITY_RATE);
        expect(delta).toBe(-5);
    });

    it('returns 0 for non-earning methods without fidelity points', () => {
        const delta = computeFidelityDelta(WAITING_KEYWORD, 100, 0, FIDELITY_RATE);
        expect(delta).toBe(0);
    });

    it('returns 0 for deleted method without fidelity points', () => {
        const delta = computeFidelityDelta(DELETED_KEYWORD, 100, 0, FIDELITY_RATE);
        expect(delta).toBe(0);
    });

    it('still deducts fidelity points for non-earning methods when points are used', () => {
        // WAITING with 5 points used: -5 (no earn because non-earning)
        const delta = computeFidelityDelta(WAITING_KEYWORD, 100, 5, FIDELITY_RATE);
        expect(delta).toBe(-5);
    });

    it('returns 0 when fidelity rate is 0 and no points used', () => {
        const delta = computeFidelityDelta('Carte Bancaire', 100, 0, 0);
        expect(delta).toBe(0);
    });

    it('still deducts used points when fidelity rate is 0', () => {
        const delta = computeFidelityDelta('Carte Bancaire', 100, 5, 0);
        expect(delta).toBe(-5);
    });
});

describe('fidelity idempotency (reversal = -forward)', () => {
    const FIDELITY_RATE = 10;

    it('reversing a normal payment negates the forward delta', () => {
        const forward = computeFidelityDelta('Carte Bancaire', 100, 0, FIDELITY_RATE);
        const reversal = -computeFidelityDelta('Carte Bancaire', 100, 0, FIDELITY_RATE);
        expect(forward).toBe(10);
        expect(reversal).toBe(-10);
        expect(forward + reversal).toBe(0);
    });

    it('reversing a refund negates the forward delta', () => {
        const forward = computeFidelityDelta(REFUND_KEYWORD, 100, 5, FIDELITY_RATE);
        const reversal = -computeFidelityDelta(REFUND_KEYWORD, 100, 5, FIDELITY_RATE);
        expect(forward).toBe(-5);
        expect(reversal).toBe(5);
        expect(forward + reversal).toBe(0);
    });

    it('re-syncing an unchanged transaction produces net-zero delta', () => {
        // Simulate: old data = new data → reversalDelta + newDelta = 0
        const method = 'Carte Bancaire';
        const amount = 100;
        const pointsUsed = 5;

        const newDelta = computeFidelityDelta(method, amount, pointsUsed, FIDELITY_RATE);
        const reversalDelta = -computeFidelityDelta(method, amount, pointsUsed, FIDELITY_RATE);
        const totalDelta = reversalDelta + newDelta;

        expect(totalDelta).toBe(0);
    });

    it('re-syncing with changed amount produces correct net delta', () => {
        // Old: amount=100, New: amount=200
        // Old delta: -5 + 10 = 5
        // New delta: -5 + 20 = 15
        // Reversal: -5
        // Net: -5 + 15 = 10 (additional 10 points for the 100 extra spent)
        const oldDelta = computeFidelityDelta('Carte Bancaire', 100, 5, FIDELITY_RATE);
        const newDelta = computeFidelityDelta('Carte Bancaire', 200, 5, FIDELITY_RATE);
        const netDelta = -oldDelta + newDelta;

        expect(oldDelta).toBe(5);
        expect(newDelta).toBe(15);
        expect(netDelta).toBe(10);
    });

    it('re-syncing with changed fidelity points produces correct net delta', () => {
        // Old: 5 points used, New: 10 points used, amount=100
        // Old delta: -5 + 10 = 5
        // New delta: -10 + 10 = 0
        // Net: -5 + 0 = -5 (customer gets 5 fewer points because they used 5 more)
        const oldDelta = computeFidelityDelta('Carte Bancaire', 100, 5, FIDELITY_RATE);
        const newDelta = computeFidelityDelta('Carte Bancaire', 100, 10, FIDELITY_RATE);
        const netDelta = -oldDelta + newDelta;

        expect(oldDelta).toBe(5);
        expect(newDelta).toBe(0);
        expect(netDelta).toBe(-5);
    });

    it('first insert (no old data) applies only the new delta', () => {
        // No old data → reversalDelta = 0, totalDelta = newDelta
        const newDelta = computeFidelityDelta('Carte Bancaire', 100, 0, FIDELITY_RATE);
        const reversalDelta = 0; // no old data
        const totalDelta = reversalDelta + newDelta;

        expect(totalDelta).toBe(10);
    });
});

describe('item-less transactions (provisions) never earn nor lose points', () => {
    const FIDELITY_RATE = 10;

    it('a provision earns nothing', () => {
        // Balance top-up: no products → no earn even with a real tender.
        const delta = computeFidelityDelta('Espèces', 100, 0, FIDELITY_RATE, false);
        expect(delta).toBe(0);
    });

    it('deleting a provision does not debit points that were never earned', () => {
        // Regression: the delete/hardDelete reversal path used to default hasProducts to
        // true, so reversing an item-less provision subtracted 10 phantom points.
        const forward = computeFidelityDelta('Espèces', 100, 0, FIDELITY_RATE, false);
        const reversal = -computeFidelityDelta('Espèces', 100, 0, FIDELITY_RATE, false);

        expect(forward).toBe(0);
        // -0 === 0, but Object.is(-0, 0) is false, so compare numerically.
        expect(reversal === 0).toBe(true);
        expect(forward + reversal).toBe(0);
    });

    it('still deducts points spent on an item-less transaction, and restores them on delete', () => {
        const forward = computeFidelityDelta('Espèces', 100, 5, FIDELITY_RATE, false);
        const reversal = -computeFidelityDelta('Espèces', 100, 5, FIDELITY_RATE, false);

        expect(forward).toBe(-5);
        expect(reversal).toBe(5);
    });

    it('a normal sale with items is unaffected', () => {
        const delta = computeFidelityDelta('Espèces', 100, 0, FIDELITY_RATE, true);
        expect(delta).toBe(10);
    });
});
