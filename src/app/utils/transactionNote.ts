import { PaymentLeg } from './interfaces';

export interface CashNote {
    cashAmount?: number;
    change?: number;
}

// Cash payment details (amount received / change given) are persisted inside the
// transactions.note column to avoid altering the database schema. The value is a
// compact JSON blob so it can round-trip losslessly and be ignored by legacy notes.
export function encodeCashNote(cashAmount?: number, change?: number): string {
    if (typeof cashAmount !== 'number' || isNaN(cashAmount)) return '';
    // When change is 0 (exact amount) or not provided, there is nothing to record.
    if (typeof change !== 'number' || isNaN(change) || change === 0) return '';
    const payload: CashNote = { cashAmount, change };
    return JSON.stringify(payload);
}

export function parseCashNote(note?: string | null): CashNote {
    if (!note) return {};
    try {
        const parsed = JSON.parse(note);
        if (parsed && typeof parsed === 'object' && typeof parsed.cashAmount === 'number') {
            return {
                cashAmount: parsed.cashAmount,
                change: typeof parsed.change === 'number' ? parsed.change : undefined,
            };
        }
    } catch {
        // Not a cash-note JSON payload (e.g. a plain-text legacy note) — ignore.
    }
    return {};
}

// Multi-payment legs are persisted as a JSON array in the `payments` TEXT
// column. This follows the same pattern as encodeCashNote/parseCashNote.
export function encodePaymentLegs(legs: PaymentLeg[]): string | null {
    if (!legs || legs.length === 0) return null;
    return JSON.stringify(legs);
}

export function parsePaymentLegs(json?: string | null): PaymentLeg[] | undefined {
    if (!json) return undefined;
    try {
        const parsed = JSON.parse(json);
        if (
            Array.isArray(parsed) &&
            parsed.every((l) => l && typeof l.method === 'string' && typeof l.amount === 'number')
        ) {
            return parsed as PaymentLeg[];
        }
    } catch {
        // Not a payment-legs JSON payload — ignore.
    }
    return undefined;
}
