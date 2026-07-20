import { DEBIT_KEYWORD, DELETED_KEYWORD, PROCESSING_KEYWORD } from '@/app/utils/constants';
import { Connection } from './db';

export interface BalanceAffectingEntry {
    id: number | string;
    amount: number; // raw signed amount as stored on the transaction
    method: string;
    createdAt: number; // epoch milliseconds
    operation: 'credit' | 'debit';
    previousBalance: number;
    newBalance: number;
}

interface RawRow {
    id: number | string;
    amount: number | string;
    payment_method: string;
    created_ms: number | string;
    has_items: boolean | number | string;
}

// Balance effect of a single transaction:
// - debits decrease the balance, everything else (provisions, refunds) adds its signed amount
//   (refund amounts are stored negative, so they naturally reduce the balance).
function balanceDelta(method: string, amount: number): number {
    return method === DEBIT_KEYWORD ? -amount : amount;
}

// Derive the customer's balance and full running history directly from the transactions table.
// This is the single source of truth: no incremental balance columns or balance_history rows
// are maintained, so deletions/edits are always reflected correctly and in order.
export async function getBalanceAffectingEntries(
    connection: Connection,
    customerName?: string | null
): Promise<{ balance: number; entries: BalanceAffectingEntry[] }> {
    if (!customerName) return { balance: 0, entries: [] };

    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = isPg
        ? `
        SELECT
            t.id,
            t.amount,
            t.payment_method,
            (EXTRACT(EPOCH FROM t.created_at) * 1000)::bigint AS created_ms,
            EXISTS (SELECT 1 FROM ${prefix}transaction_items ti WHERE ti.transaction_id = t.id) AS has_items
        FROM ${prefix}transactions t
        WHERE t.customer_name = $1 AND t.payment_method NOT IN ($2, $3)
        ORDER BY t.created_at ASC, t.id ASC
    `
        : `
        SELECT
            t.id,
            t.amount,
            t.payment_method,
            (UNIX_TIMESTAMP(t.created_at) + TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())) * 1000 AS created_ms,
            EXISTS (SELECT 1 FROM transaction_items ti WHERE ti.transaction_id = t.id) AS has_items
        FROM transactions t
        WHERE t.customer_name = ? AND t.payment_method NOT IN (?, ?)
        ORDER BY t.created_at ASC, t.id ASC
    `;

    const [rows] = await connection.execute(query, [customerName, DELETED_KEYWORD, PROCESSING_KEYWORD]);

    let running = 0;
    const entries: BalanceAffectingEntry[] = [];
    for (const row of rows as RawRow[]) {
        const method = row.payment_method;
        const amount = Number(row.amount);
        const hasItems = row.has_items === true || row.has_items === 1 || row.has_items === '1';

        // Only debits and item-less transactions (provisions/refunds) affect the balance.
        if (method !== DEBIT_KEYWORD && hasItems) continue;

        const delta = balanceDelta(method, amount);
        const previousBalance = running;
        running += delta;

        entries.push({
            id: row.id,
            amount,
            method,
            createdAt: Number(row.created_ms),
            operation: delta >= 0 ? 'credit' : 'debit',
            previousBalance,
            newBalance: running,
        });
    }

    return { balance: running, entries };
}
