import { Connection } from './db';
import { computeTransactionHash, type TransactionItemHashInput } from '@/app/utils/transactionHash';
import { parsePaymentLegs } from '@/app/utils/transactionNote';

/**
 * Recompute hashes for the given transaction and every subsequent one.
 *
 * Reads the stored rows (created_at included in the digest), so the caller
 * only needs to have updated the row itself beforehand. The first row's
 * stored previous_hash is trusted as the chain anchor.
 *
 * Callers MUST hold the `nf525_transactions` hash-chain lock (lockHashChain)
 * and must have verified the rechain cannot reach a sealed day — the cascade
 * rewrites hash/previous_hash on every row from `fromTransactionId` onward.
 */
export async function rechainFrom(connection: Connection, fromTransactionId: number | string): Promise<void> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Fetch the modified transaction and all subsequent transactions
    const txQuery = isPg
        ? `SELECT id, order_id, user_name, payment_method, amount, currency, change, device_id, payments, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at, previous_hash FROM ${prefix}transactions WHERE id >= $1 ORDER BY id ASC FOR UPDATE`
        : `SELECT id, order_id, user_name, payment_method, amount, currency, change, device_id, payments, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at, previous_hash FROM ${prefix}transactions WHERE id >= ? ORDER BY id ASC FOR UPDATE`;
    const [txRows] = await connection.execute(txQuery, [fromTransactionId]);
    const txs = txRows as {
        id: number | string;
        order_id: string;
        user_name: string;
        payment_method: string;
        amount: number | string;
        currency: string;
        change: string | null;
        device_id: string | null;
        payments: string | null;
        created_at: string;
        previous_hash: string | null;
    }[];

    if (txs.length === 0) return;

    // Fetch items for all these transactions
    const txIds = txs.map((t) => t.id);
    const itemsByTx = new Map<number | string, TransactionItemHashInput[]>();

    if (isPg) {
        const itemQuery = `SELECT transaction_id, label, quantity, amount, total, vat_rate, discount_amount FROM ${prefix}transaction_items WHERE transaction_id = ANY($1::int[]) ORDER BY transaction_id, id`;
        const [itemRows] = await connection.execute(itemQuery, [txIds]);
        for (const row of itemRows as {
            transaction_id: number;
            label: string;
            quantity: number | string;
            amount: number | string;
            total: number | string;
            vat_rate: number | string | null;
            discount_amount: number | string | null;
        }[]) {
            const list = itemsByTx.get(row.transaction_id) || [];
            list.push({
                label: row.label,
                quantity: Number(row.quantity),
                amount: row.amount,
                total: row.total,
                vat_rate: row.vat_rate ?? undefined,
                discount_amount: row.discount_amount ?? undefined,
            });
            itemsByTx.set(row.transaction_id, list);
        }
    } else {
        // MariaDB: use IN clause
        const placeholders = txIds.map(() => '?').join(', ');
        const itemQuery = `SELECT transaction_id, label, quantity, amount, total, vat_rate, discount_amount FROM ${prefix}transaction_items WHERE transaction_id IN (${placeholders}) ORDER BY transaction_id, id`;
        const [itemRows] = await connection.execute(itemQuery, txIds);
        for (const row of itemRows as {
            transaction_id: number;
            label: string;
            quantity: number | string;
            amount: number | string;
            total: number | string;
            vat_rate: number | string | null;
            discount_amount: number | string | null;
        }[]) {
            const list = itemsByTx.get(row.transaction_id) || [];
            list.push({
                label: row.label,
                quantity: Number(row.quantity),
                amount: row.amount,
                total: row.total,
                vat_rate: row.vat_rate ?? undefined,
                discount_amount: row.discount_amount ?? undefined,
            });
            itemsByTx.set(row.transaction_id, list);
        }
    }

    // Recompute hashes starting from the first (modified) transaction
    // The first transaction's previous_hash is already correct (it was set
    // by the handler that called us). We just need to recompute its hash
    // and cascade to all subsequent transactions.
    let prevHash: string | null = txs[0].previous_hash;
    const updates: { id: number | string; hash: string; previousHash: string | null }[] = [];

    for (const tx of txs) {
        const items = itemsByTx.get(tx.id);
        const hash = computeTransactionHash(
            {
                order_id: tx.order_id,
                user_name: tx.user_name,
                payment_method: tx.payment_method,
                amount: tx.amount,
                currency: tx.currency,
                created_at: tx.created_at,
                change: tx.change,
                device_id: tx.device_id,
                items,
                payments: parsePaymentLegs(tx.payments),
            },
            tx.id,
            prevHash
        );
        updates.push({ id: tx.id, hash, previousHash: prevHash });
        prevHash = hash;
    }

    // Batch update (skip the first transaction if its hash hasn't changed —
    // the handler already set it. But it's simpler and safer to just update all).
    const BATCH_SIZE = 500;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const ids = batch.map((u) => u.id);
        const hashes = batch.map((u) => u.hash);
        const prevHashes = batch.map((u) => u.previousHash);

        if (isPg) {
            await connection.execute(
                `UPDATE ${prefix}transactions AS t SET
                    hash = v.hash,
                    previous_hash = v.prev_hash
                FROM unnest($1::int[], $2::text[], $3::text[]) AS v(id, hash, prev_hash)
                WHERE t.id = v.id`,
                [ids, hashes, prevHashes]
            );
        } else {
            // MariaDB: update one by one (no unnest support)
            for (const u of batch) {
                await connection.execute(`UPDATE ${prefix}transactions SET hash = ?, previous_hash = ? WHERE id = ?`, [
                    u.hash,
                    u.previousHash,
                    u.id,
                ]);
            }
        }
    }
}
