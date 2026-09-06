import { createHash } from 'crypto';

export interface TransactionHashInput {
    order_id: string;
    user_name: string;
    payment_method: string;
    amount: number | string;
    currency: string;
    created_at: string;
    change?: string | null;
    device_id?: string | null;
}

export function computeTransactionHash(
    tx: TransactionHashInput,
    transactionId?: string | number,
    previousHash?: string | null
): string {
    const data = [
        previousHash || '',
        transactionId || 'new',
        tx.order_id,
        tx.user_name,
        tx.payment_method,
        String(Number(tx.amount)),
        tx.currency,
        String(tx.created_at),
        tx.change || '',
        tx.device_id || '',
    ].join('|');

    return createHash('sha256').update(data).digest('hex');
}
