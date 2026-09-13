/**
 * Repair the transaction hash chain from a fork point onward.
 *
 * A fork happens when two transactions are inserted concurrently and both
 * point at the same previous_hash, or when an early insert was hashed with
 * the 'new' placeholder id (pre-fix). This script walks the chain by id,
 * finds the first anomaly (or accepts --from <id>), then recomputes
 * hash + previous_hash for every transaction from that point — the same
 * logic as rechainFrom() in the saveTransaction route.
 *
 * ⚠️  Rewrites stored hashes. Closure anchors (first/last tx hash per day)
 * become stale: re-run scripts/populate-nf525-tables.ts --force-rechain
 * afterwards.
 *
 * Usage: bun run scripts/rechain-transactions.ts [--from <id>] [--dry-run]
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { computeTransactionHash, type TransactionItemHashInput } from '../src/app/utils/transactionHash';
import { parsePaymentLegs } from '../src/app/utils/transactionNote';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const fromIdx = args.indexOf('--from');
const FROM_ARG = fromIdx >= 0 ? Number(args[fromIdx + 1]) : null;

const database = process.env.NEXT_PUBLIC_SHOP_ID || process.env.PG_DATABASE || 'neondb';
const pool = new Pool({
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database,
    ssl: { rejectUnauthorized: false },
});

interface TxRow {
    id: number;
    order_id: string;
    user_name: string;
    payment_method: string;
    amount: number | string;
    currency: string;
    change: string | null;
    device_id: string | null;
    payments: string | null;
    created_at: string;
    hash: string | null;
    previous_hash: string | null;
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('SET search_path TO dc_pos, public');
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [`${database}.nf525_transactions`]);

        // Find the first chain anomaly unless --from was passed.
        let fromId = FROM_ARG;
        if (fromId === null) {
            const { rows } = await client.query<TxRow>(
                `SELECT id, hash, previous_hash FROM dc_pos.transactions ORDER BY id ASC`
            );
            let prevHash: string | null = null;
            for (const row of rows) {
                if (row.previous_hash !== prevHash) {
                    fromId = row.id;
                    console.log(
                        `Fork detected at tx #${row.id}: stored prev ${row.previous_hash?.slice(0, 16)}… ` +
                            `but expected ${prevHash?.slice(0, 16) ?? 'null'}…`
                    );
                    break;
                }
                prevHash = row.hash;
            }
        }
        if (fromId === null) {
            console.log('Chain is already linear — nothing to do.');
            return;
        }

        // The fork's other branch may itself carry a stale hash (e.g. a row
        // hashed with the 'new' placeholder id). Walk back while the previous
        // row's stored hash does not match its recomputed value.
        for (;;) {
            const { rows: prev } = await client.query<TxRow>(
                `SELECT id, order_id, user_name, payment_method, amount, currency, change, device_id, payments,
                        to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at, hash, previous_hash
                 FROM dc_pos.transactions WHERE id < $1 ORDER BY id DESC LIMIT 1`,
                [fromId]
            );
            const p = prev[0];
            if (!p) break;
            const { rows: its } = await client.query(
                `SELECT label, quantity, amount, total, vat_rate, discount_amount
                 FROM dc_pos.transaction_items WHERE transaction_id = $1 ORDER BY id`,
                [p.id]
            );
            const items = (its as Record<string, unknown>[]).map((r) => ({
                label: r.label as string,
                quantity: Number(r.quantity),
                amount: r.amount as number | string,
                total: r.total as number | string,
                vat_rate: r.vat_rate == null ? undefined : (r.vat_rate as number | string),
                discount_amount: r.discount_amount == null ? undefined : (r.discount_amount as number | string),
            }));
            const recomputed = computeTransactionHash(
                {
                    order_id: p.order_id,
                    user_name: p.user_name,
                    payment_method: p.payment_method,
                    amount: p.amount,
                    currency: p.currency,
                    created_at: p.created_at,
                    change: p.change,
                    device_id: p.device_id,
                    items,
                    payments: parsePaymentLegs(p.payments),
                },
                p.id,
                p.previous_hash
            );
            if (recomputed === p.hash) break;
            console.log(`Tx #${p.id} also has an invalid stored hash — extending rechain.`);
            fromId = p.id;
        }

        // Same query as rechainFrom() — created_at formatted identically.
        const { rows: txs } = await client.query<TxRow>(
            `SELECT id, order_id, user_name, payment_method, amount, currency, change, device_id, payments,
                    to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at, hash, previous_hash
             FROM dc_pos.transactions WHERE id >= $1 ORDER BY id ASC FOR UPDATE`,
            [fromId]
        );
        console.log(`Rechaining ${txs.length} transactions from #${fromId} (db=${database})`);

        const txIds = txs.map((t) => t.id);
        const itemsByTx = new Map<number, TransactionItemHashInput[]>();
        const { rows: itemRows } = await client.query(
            `SELECT transaction_id, label, quantity, amount, total, vat_rate, discount_amount
             FROM dc_pos.transaction_items WHERE transaction_id = ANY($1::int[]) ORDER BY transaction_id, id`,
            [txIds]
        );
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

        // The row before fromId keeps its hash — it is the anchor.
        const { rows: anchorRows } = await client.query<{ hash: string | null }>(
            `SELECT hash FROM dc_pos.transactions WHERE id < $1 ORDER BY id DESC LIMIT 1`,
            [fromId]
        );
        let prevHash: string | null = anchorRows[0]?.hash ?? null;

        let changed = 0;
        if (!DRY_RUN) await client.query('BEGIN');
        try {
            for (const tx of txs) {
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
                        items: itemsByTx.get(tx.id),
                        payments: parsePaymentLegs(tx.payments),
                    },
                    tx.id,
                    prevHash
                );
                if (hash !== tx.hash || prevHash !== tx.previous_hash) {
                    changed++;
                    if (DRY_RUN) {
                        console.log(
                            `  #${tx.id}: prev ${tx.previous_hash?.slice(0, 12)}…→${prevHash?.slice(0, 12) ?? 'null'}… ` +
                                `hash ${tx.hash?.slice(0, 12)}…→${hash.slice(0, 12)}…`
                        );
                    } else {
                        await client.query(
                            `UPDATE dc_pos.transactions SET hash = $1, previous_hash = $2 WHERE id = $3`,
                            [hash, prevHash, tx.id]
                        );
                    }
                }
                prevHash = hash;
            }
            if (!DRY_RUN) await client.query('COMMIT');
        } catch (e) {
            if (!DRY_RUN) await client.query('ROLLBACK');
            throw e;
        }

        console.log(
            `${DRY_RUN ? '[dry-run] ' : ''}${changed}/${txs.length} transactions updated.` +
                (DRY_RUN ? '' : ' Re-run scripts/populate-nf525-tables.ts --force-rechain to refresh closure anchors.')
        );
    } finally {
        try {
            await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`${database}.nf525_transactions`]);
        } catch {
            /* lock released with the session anyway */
        }
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
