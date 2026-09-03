import {
    CANCELLED_KEYWORD,
    DELETED_KEYWORD,
    PROCESSING_KEYWORD,
    REFUND_KEYWORD,
    UPDATING_KEYWORD,
    WAITING_KEYWORD,
} from './constants';

// Payment methods that never earn fidelity points. Points that were *spent* on such a
// transaction are still deducted — only the earning side is suppressed.
export const NON_EARNING_METHODS = [
    WAITING_KEYWORD,
    PROCESSING_KEYWORD,
    UPDATING_KEYWORD,
    DELETED_KEYWORD,
    CANCELLED_KEYWORD,
    'METTRE ' + WAITING_KEYWORD,
];

/**
 * Compute the forward fidelity point delta for a single transaction.
 * Callers negate the result for reversal operations.
 *
 * - Normal payment with a customer: earns points = amount × fidelityRate / 100
 * - Refund with a customer: deducts points = |amount| × fidelityRate / 100, and restores used points
 * - Fidelity payment (fidelity_points used): deducts the used points
 *
 * This is the single source of truth shared by the server (`saveTransaction` route) and the
 * client (`usePay`), so the optimistic local update always matches the persisted value.
 */
export function computeFidelityDelta(
    method: string,
    amount: number,
    fidelityPointsUsed: number,
    fidelityRate: number,
    hasProducts = true
): number {
    const isRefund = method === REFUND_KEYWORD;
    const isNonEarning = NON_EARNING_METHODS.includes(method) || !hasProducts;

    if (fidelityPointsUsed <= 0 && isNonEarning) return 0;
    if (fidelityRate <= 0 && fidelityPointsUsed <= 0) return 0;

    let delta = 0;

    if (fidelityPointsUsed > 0) {
        if (isRefund) {
            delta += fidelityPointsUsed;
        } else {
            delta -= fidelityPointsUsed;
        }
    }

    if (!isNonEarning && fidelityRate > 0) {
        const absAmount = Math.abs(amount);
        const earnedPoints = (absAmount * fidelityRate) / 100;
        delta += isRefund ? -earnedPoints : earnedPoints;
    }

    return delta;
}
