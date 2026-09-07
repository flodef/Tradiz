import { Transaction, PaymentLeg } from './interfaces';

// Returns the payment legs for a transaction. When `transaction.payments` is
// present (multi-payment or split), returns those legs. Otherwise, falls back
// to a single-leg array derived from the legacy `method` + `amount` fields.
// Every per-method consumer (Z ticket, summary, fiscal archive, receipt) should
// call this instead of reading `transaction.method` directly.
export function getPaymentBreakdown(tx: Transaction): PaymentLeg[] {
    if (tx.payments && tx.payments.length > 0) {
        return tx.payments;
    }
    return [{ method: tx.method, amount: tx.amount }];
}
