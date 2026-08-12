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
