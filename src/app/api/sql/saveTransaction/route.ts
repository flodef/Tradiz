import { PROCESSING_KEYWORD, DEFAULT_USER, DEFAULT_VAT_RATE, EXPUNGED_KEYWORD } from '@/app/utils/constants';
import { computeFidelityDelta } from '@/app/utils/fidelity';
import { getShopIdFromRequest } from '@/app/constants/shop';
import { stoppedSubscriptionResponse, subscriptionStopped } from '../subscriptionStore';
import { NextResponse } from 'next/server';
import { Connection, getPosDb } from '../db';
import { insertAuditEvent, lockHashChain } from '../auditHelpers';
import { computeTransactionHash, type TransactionItemHashInput } from '@/app/utils/transactionHash';
import { encodePaymentLegs, parsePaymentLegs } from '@/app/utils/transactionNote';
import { PaymentLeg } from '@/app/utils/interfaces';

interface TransactionProduct {
    label: string;
    category: string;
    amount: number;
    quantity: number;
    discount_amount?: number;
    discount_unit?: string;
    total: number;
    vat_rate?: number;
}

/**
 * Normalize a product to the exact form that will be persisted to the
 * `transaction_items` table. This is the single source of truth for what
 * the hash must cover: both the INSERT parameters and the hash input are
 * derived from this helper, so the two can never drift.
 *
 * - `vat_rate` defaults to DEFAULT_VAT_RATE (20) when absent, matching the
 *   INSERT below. Previously the hash normalized missing VAT to 0 while the
 *   INSERT stored 20, making every defaulted-VAT transaction unverifiable.
 * - `discount_amount` defaults to 0, matching the INSERT.
 */
function toPersistedItem(product: TransactionProduct): TransactionItemHashInput {
    return {
        label: product.label,
        quantity: product.quantity,
        amount: product.amount,
        total: product.total,
        vat_rate: product.vat_rate ?? DEFAULT_VAT_RATE,
        discount_amount: product.discount_amount ?? 0,
    };
}

/**
 * Map all products to their persisted form for hashing. The persisted form
 * is what verifyIntegrity will re-read from the database, so the hash must
 * be computed over the same values.
 */
function toPersistedItems(products?: TransactionProduct[]): TransactionItemHashInput[] | undefined {
    if (!products || products.length === 0) return undefined;
    return products.map(toPersistedItem);
}

interface TransactionData {
    order_id: string;
    customer_name?: string | null;
    user_name: string;
    payment_method: string;
    amount: number;
    currency: string;
    change?: string;
    takeOut?: boolean;
    employer_share?: number | null;
    fidelity_points?: number | null;
    device_id?: string | null;
    created_at: string;
    updated_at: string;
    products?: TransactionProduct[];
    payments?: PaymentLeg[];
}

interface IdRow {
    id: number | string;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);

    // Parse the body ONCE, outside the retry loop — request.json() consumes
    // the body stream and cannot be called again on retry.
    let body: { action: string; transaction: TransactionData };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { action, transaction } = body;
    if (!action || !transaction)
        return NextResponse.json({ error: 'Action and transaction data are required' }, { status: 400 });

    // Retry on deadlock — PostgreSQL can detect deadlocks when two POS devices
    // save transactions concurrently. The transaction is idempotent (uses
    // order_id as a natural key), so retrying is safe.
    const MAX_RETRIES = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        let connection: Connection | undefined;
        try {
            connection = await getPosDb(shopId);
            if (await subscriptionStopped(connection)) {
                return stoppedSubscriptionResponse();
            }

            await connection.beginTransaction();
            // Serialize writers on the transaction hash chain — a concurrent
            // save reading the same tail hash would fork the chain.
            const unlockChain = await lockHashChain(connection, 'nf525_transactions');

            try {
                // Fetch the OLD transaction's fidelity-relevant fields BEFORE the handler
                // overwrites or removes the row. For add/sync this lets us reverse the
                // previously applied delta so re-syncing is idempotent; for delete/expunge
                // it tells us whether the row had items (item-less provisions never earn).
                let oldFidelityData: OldFidelityData | null = null;
                if (action === 'add' || action === 'sync' || action === 'delete' || action === 'expunge') {
                    oldFidelityData = await fetchOldFidelityData(connection, transaction.order_id);
                }

                switch (action) {
                    case 'add':
                        await handleAddTransaction(connection, transaction);
                        await insertAuditEvent(connection, {
                            event_type: 'transaction_add',
                            entity_id: transaction.order_id,
                            user_name: transaction.user_name || DEFAULT_USER,
                            device_id: transaction.device_id ?? null,
                            detail: `amount=${transaction.amount} method=${transaction.payment_method}`,
                        });
                        break;
                    case 'update':
                        await handleUpdateTransaction(connection, transaction);
                        await insertAuditEvent(connection, {
                            event_type: 'transaction_update',
                            entity_id: transaction.order_id,
                            user_name: transaction.user_name || DEFAULT_USER,
                            device_id: transaction.device_id ?? null,
                            detail: `marked as ${PROCESSING_KEYWORD}`,
                        });
                        break;
                    case 'delete':
                        await handleDeleteTransaction(connection, transaction);
                        await insertAuditEvent(connection, {
                            event_type: 'transaction_delete',
                            entity_id: transaction.order_id,
                            user_name: transaction.user_name || DEFAULT_USER,
                            device_id: transaction.device_id ?? null,
                            detail: `method=${transaction.payment_method}`,
                        });
                        break;
                    case 'expunge':
                        await handleExpungeTransaction(connection, transaction);
                        await insertAuditEvent(connection, {
                            event_type: 'transaction_expunge',
                            entity_id: transaction.order_id,
                            user_name: transaction.user_name || DEFAULT_USER,
                            device_id: transaction.device_id ?? null,
                            detail: `permanent deletion of order_id=${transaction.order_id}`,
                        });
                        break;
                    case 'sync':
                        await handleSyncTransaction(connection, transaction);
                        await insertAuditEvent(connection, {
                            event_type: 'transaction_sync',
                            entity_id: transaction.order_id,
                            user_name: transaction.user_name || DEFAULT_USER,
                            device_id: transaction.device_id ?? null,
                            detail: `amount=${transaction.amount} method=${transaction.payment_method}`,
                        });
                        break;
                    default:
                        throw new Error(`Unknown action: ${action}`);
                }

                // Update customer fidelity points after the transaction is saved.
                // - 'add'/'sync': reverse any previously applied delta, then apply the new delta.
                //   This makes fidelity crediting idempotent: re-syncing the same transaction
                //   produces a net-zero delta (old reversed + new applied = 0 if unchanged).
                // - 'delete'/'expunge': reverse the original delta (restore points)
                // - 'update': just marks as PROCESSING, no point change
                if (action === 'add' || action === 'sync') {
                    await updateCustomerFidelityPointsIdempotent(connection, transaction, oldFidelityData);
                } else if (action === 'delete' || action === 'expunge') {
                    await updateCustomerFidelityPoints(
                        connection,
                        transaction,
                        true,
                        oldFidelityData?.has_items ?? true
                    );
                }

                await connection.commit();
                await unlockChain();
                await connection.end();

                return NextResponse.json({ success: true, message: 'Transaction saved successfully' }, { status: 200 });
            } catch (error) {
                await connection.rollback();
                await unlockChain();
                throw error;
            }
        } catch (error) {
            lastError = error;
            const isDeadlock = String(error).toLowerCase().includes('deadlock');
            if (isDeadlock && attempt < MAX_RETRIES) {
                // Wait briefly before retrying to let the other transaction finish
                await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
                continue;
            }
            break;
        } finally {
            // Ensure connection is always closed (end() is idempotent — safe to call
            // even if already ended in the try block above).
            try {
                await connection?.end();
            } catch {
                // ignore — connection may already be closed
            }
        }
    }

    console.error('Database transaction error:', lastError);
    return NextResponse.json(
        { error: 'An error occurred while saving transaction', details: String(lastError) },
        { status: 500 }
    );
}

export function generateTransactionHash(
    transaction: TransactionData,
    transactionId?: string | number,
    previousHash?: string
): string {
    // Hash over the PERSISTED form of the items (vat_rate, discount_amount
    // normalized to their DB defaults), not the raw client payload. This
    // matches what verifyIntegrity re-reads from the database.
    return computeTransactionHash(
        { ...transaction, items: toPersistedItems(transaction.products), payments: transaction.payments },
        transactionId,
        previousHash
    );
}

async function handleAddTransaction(connection: Connection, transaction: TransactionData) {
    // Check if transaction already exists (by order_id — millisecond precision,
    // unique per transaction). Using created_at is unsafe because toSQLDateTime
    // truncates to seconds, causing two transactions within the same second to
    // collide and overwrite each other.
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const checkQuery = isPg
        ? `SELECT id FROM ${prefix}transactions WHERE order_id = $1`
        : `SELECT id FROM ${prefix}transactions WHERE order_id = ?`;
    const [existing] = await connection.execute(checkQuery, [transaction.order_id]);
    const existingRows = existing as IdRow[];

    if (existingRows.length > 0) {
        // Transaction already exists — sync it (update + replace items)
        await handleSyncTransaction(connection, transaction);
        return;
    }

    // No existing transaction — insert a new one + items
    await insertTransactionWithItems(connection, transaction);
}

// Fetch the most recent transaction hash for chaining (NF525 requirement).
async function getLatestHash(connection: Connection): Promise<string | null> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = isPg
        ? `SELECT hash FROM ${prefix}transactions ORDER BY id DESC LIMIT 1`
        : `SELECT hash FROM ${prefix}transactions ORDER BY id DESC LIMIT 1`;
    const [rows] = await connection.execute(query);
    const result = (rows as { hash: string | null }[])[0];
    return result?.hash ?? null;
}

// Insert a new transaction row and its items. Returns the transaction id.
async function insertTransactionWithItems(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    const userName = transaction.user_name || DEFAULT_USER;
    const previousHash = await getLatestHash(connection);
    const hash = generateTransactionHash(transaction, undefined, previousHash ?? undefined);

    const insertTransactionQuery = isPg
        ? `
        INSERT INTO ${prefix}transactions (order_id, customer_name, user_name, payment_method, amount, currency, change, take_out, employer_share, fidelity_points, device_id, payments, hash, previous_hash, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id
    `
        : `
        INSERT INTO ${prefix}transactions (order_id, customer_name, user_name, payment_method, amount, currency, change, take_out, employer_share, fidelity_points, device_id, payments, hash, previous_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
        transaction.order_id,
        transaction.customer_name ?? null,
        userName,
        transaction.payment_method,
        transaction.amount,
        transaction.currency,
        transaction.change || null,
        transaction.takeOut ?? false,
        transaction.employer_share ?? null,
        transaction.fidelity_points ?? null,
        transaction.device_id ?? null,
        encodePaymentLegs(transaction.payments ?? []) ?? null,
        hash,
        previousHash,
        transaction.created_at,
        transaction.updated_at,
    ];

    let transactionId: number | string;
    if (isPg) {
        const [rows] = await connection.execute(insertTransactionQuery, params);
        transactionId = (rows as IdRow[])[0].id;
    } else {
        await connection.execute(insertTransactionQuery, params);
        const [rows] = await connection.execute('SELECT LAST_INSERT_ID() as id');
        transactionId = (rows as IdRow[])[0].id;
    }

    await insertTransactionItems(connection, transactionId, transaction.products);

    // The digest embeds the transaction id, unknown before the INSERT — the
    // 'new' placeholder hash stored above must be replaced with the real one
    // or verifyIntegrity would flag this row until the next rechain.
    const finalHash = generateTransactionHash(transaction, transactionId, previousHash ?? undefined);
    await connection.execute(
        isPg
            ? `UPDATE ${prefix}transactions SET hash = $1 WHERE id = $2`
            : `UPDATE ${prefix}transactions SET hash = ? WHERE id = ?`,
        [finalHash, transactionId]
    );
}

// Insert transaction items for a given transaction id.
async function insertTransactionItems(
    connection: Connection,
    transactionId: number | string,
    products?: TransactionProduct[]
) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    if (!products || products.length === 0) return;

    for (const product of products) {
        const insertItemQuery = isPg
            ? `
            INSERT INTO ${prefix}transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total, vat_rate)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `
            : `
            INSERT INTO ${prefix}transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total, vat_rate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(insertItemQuery, [
            transactionId,
            product.label,
            product.category,
            product.amount,
            product.quantity,
            product.discount_amount || 0,
            product.discount_unit || '',
            product.total,
            product.vat_rate ?? DEFAULT_VAT_RATE,
        ]);
    }
}

/**
 * Rechain all transactions from a given transaction id onward.
 *
 * When a transaction's hash-relevant fields change (payment_method, user_name,
 * amount, etc.), its hash changes. Every subsequent transaction's previous_hash
 * must be updated to point to the new hash, and their own hashes must be
 * recomputed because they depend on the previous hash.
 *
 * This function:
 * 1. Fetches the modified transaction and all subsequent transactions (by id)
 * 2. Fetches their line items
 * 3. Recomputes all hashes from the modified transaction onward
 * 4. Batch-updates the hashes and previous_hashes
 *
 * In normal POS usage, the modified transaction is usually near the end of the
 * chain, so only a few rows need updating. In the worst case (modification of
 * an early transaction), the entire chain is rechained.
 */
async function rechainFrom(connection: Connection, fromTransactionId: number | string): Promise<void> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Fetch the modified transaction and all subsequent transactions
    const txQuery = isPg
        ? `SELECT id, order_id, user_name, payment_method, amount, currency, change, device_id, payments, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at, previous_hash FROM ${prefix}transactions WHERE id >= $1 ORDER BY id ASC FOR UPDATE`
        : `SELECT id, order_id, user_name, payment_method, amount, currency, change, device_id, payments, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at, previous_hash FROM ${prefix}transactions WHERE id >= ? ORDER BY id ASC FOR UPDATE`;
    const [txRows] = await connection.execute(txQuery, [fromTransactionId]);
    const txs = txRows as (IdRow & {
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
    })[];

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

async function handleUpdateTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Lock the row and get the id for rechaining. The hash is recomputed by rechainFrom
    // which includes items and payments — no need to compute it here.
    const selectQuery = isPg
        ? `SELECT id FROM ${prefix}transactions WHERE order_id = $1 FOR UPDATE`
        : `SELECT id FROM ${prefix}transactions WHERE order_id = ? FOR UPDATE`;
    const [rows] = await connection.execute(selectQuery, [transaction.order_id]);
    const existing = (rows as IdRow[])[0];

    if (!existing) return; // Transaction doesn't exist — nothing to update

    const transactionId = existing.id;

    // Update the transaction record to mark it as processing.
    // rechainFrom will recompute the hash with the full data (items + payments).
    const updateQuery = isPg
        ? `UPDATE ${prefix}transactions SET payment_method = $1, user_name = $2, device_id = $3, updated_at = $4 WHERE id = $5`
        : `UPDATE ${prefix}transactions SET payment_method = ?, user_name = ?, device_id = ?, updated_at = ? WHERE id = ?`;

    await connection.execute(updateQuery, [
        PROCESSING_KEYWORD,
        transaction.user_name || DEFAULT_USER,
        transaction.device_id ?? null,
        transaction.updated_at,
        transactionId,
    ]);

    // Rechain all subsequent transactions since this transaction's hash changed
    await rechainFrom(connection, transactionId);
}

async function handleDeleteTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Save the new payment_method (DELETED_KEYWORD or CANCELLED_KEYWORD) before
    // fetchOriginalTransactionForFidelity overwrites it with the original DB value.
    const newPaymentMethod = transaction.payment_method;

    // Fetch the original transaction data (for fidelity point reversal) before marking as deleted
    await fetchOriginalTransactionForFidelity(connection, transaction);

    // Lock the row and get the id for rechaining. The hash is recomputed by rechainFrom
    // which includes items and payments — no need to compute it here.
    const selectQuery = isPg
        ? `SELECT id FROM ${prefix}transactions WHERE order_id = $1 FOR UPDATE`
        : `SELECT id FROM ${prefix}transactions WHERE order_id = ? FOR UPDATE`;
    const [rows] = await connection.execute(selectQuery, [transaction.order_id]);
    const existing = (rows as IdRow[])[0];

    if (!existing) return; // Transaction doesn't exist — nothing to delete

    const transactionId = existing.id;

    // Update the transaction record to mark it as deleted/cancelled.
    // rechainFrom will recompute the hash with the full data (items + payments).
    const updateQuery = isPg
        ? `UPDATE ${prefix}transactions SET payment_method = $1, updated_at = $2 WHERE id = $3`
        : `UPDATE ${prefix}transactions SET payment_method = ?, updated_at = ? WHERE id = ?`;

    await connection.execute(updateQuery, [newPaymentMethod, transaction.updated_at, transactionId]);

    // Rechain all subsequent transactions since this transaction's hash changed
    await rechainFrom(connection, transactionId);
}

async function handleExpungeTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Fetch the original transaction data (for fidelity point reversal) before marking as expunged
    await fetchOriginalTransactionForFidelity(connection, transaction);

    // Lock the row and get the id for rechaining. The hash is recomputed by rechainFrom
    // which includes items and payments — no need to compute it here.
    const selectQuery = isPg
        ? `SELECT id FROM ${prefix}transactions WHERE order_id = $1 FOR UPDATE`
        : `SELECT id FROM ${prefix}transactions WHERE order_id = ? FOR UPDATE`;
    const [rows] = await connection.execute(selectQuery, [transaction.order_id]);
    const existing = (rows as IdRow[])[0];

    if (!existing) return; // Transaction doesn't exist — nothing to expunge

    const transactionId = existing.id;

    // NF525: Instead of physically deleting, mark the transaction as EXPUNGED.
    // This preserves the audit trail and hash chain integrity.
    // rechainFrom will recompute the hash with the full data (items + payments).
    const updateQuery = isPg
        ? `UPDATE ${prefix}transactions SET payment_method = $1, updated_at = $2 WHERE id = $3`
        : `UPDATE ${prefix}transactions SET payment_method = ?, updated_at = ? WHERE id = ?`;

    await connection.execute(updateQuery, [EXPUNGED_KEYWORD, transaction.updated_at, transactionId]);

    // Rechain all subsequent transactions since this transaction's hash changed
    await rechainFrom(connection, transactionId);
}

// Snapshot of fidelity-relevant fields from a transaction row, used to
// reverse a previously applied delta before applying a new one.
interface OldFidelityData {
    payment_method: string;
    amount: number;
    customer_name: string | null;
    fidelity_points: number | null;
    has_items: boolean;
}

// Fetch the old transaction's fidelity-relevant fields BEFORE overwriting the row.
// Returns null if the transaction doesn't exist yet (first insert).
async function fetchOldFidelityData(connection: Connection, orderId: string): Promise<OldFidelityData | null> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = isPg
        ? `SELECT payment_method, amount, customer_name, fidelity_points, EXISTS (SELECT 1 FROM ${prefix}transaction_items ti WHERE ti.transaction_id = t.id) AS has_items FROM ${prefix}transactions t WHERE t.order_id = $1`
        : `SELECT payment_method, amount, customer_name, fidelity_points, EXISTS (SELECT 1 FROM transaction_items ti WHERE ti.transaction_id = t.id) AS has_items FROM transactions t WHERE t.order_id = ?`;
    const [rows] = await connection.execute(query, [orderId]);
    const original = (
        rows as {
            payment_method: string;
            amount: number | string;
            customer_name: string | null;
            fidelity_points: number | string | null;
            has_items: boolean | number | string;
        }[]
    )[0];

    if (!original) return null;

    return {
        payment_method: original.payment_method,
        amount: Number(original.amount),
        customer_name: original.customer_name,
        fidelity_points: original.fidelity_points != null ? Number(original.fidelity_points) : null,
        has_items: original.has_items === true || original.has_items === 1 || original.has_items === '1',
    };
}

// Fetch the original transaction from DB and populate fidelity-relevant fields on the
// incoming transaction object, so updateCustomerFidelityPoints can compute the reversal.
// The client may not send fidelity_points/amount/payment_method for delete actions.
async function fetchOriginalTransactionForFidelity(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = isPg
        ? `SELECT payment_method, amount, customer_name, fidelity_points FROM ${prefix}transactions WHERE order_id = $1`
        : `SELECT payment_method, amount, customer_name, fidelity_points FROM transactions WHERE order_id = ?`;
    const [rows] = await connection.execute(query, [transaction.order_id]);
    const original = (
        rows as {
            payment_method: string;
            amount: number | string;
            customer_name: string | null;
            fidelity_points: number | string | null;
        }[]
    )[0];

    if (original) {
        // Always restore payment_method and amount from DB — the client sets
        // method=DELETED_KEYWORD or CANCELLED_KEYWORD before sending, which would
        // prevent earn/deduct reversal if we trusted it.
        transaction.payment_method = original.payment_method;
        transaction.amount = Number(original.amount);
        transaction.customer_name = original.customer_name;
        // Only restore fidelity_points if the client didn't provide them
        if (transaction.fidelity_points == null) {
            transaction.fidelity_points = original.fidelity_points != null ? Number(original.fidelity_points) : null;
        }
    }
}

async function handleSyncTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Use UPDATE ... RETURNING to atomically check-and-update.
    // This prevents a race condition where the transaction is expunged by
    // a concurrent request between the SELECT and the item INSERT, which would
    // cause a foreign key violation.
    const userName = transaction.user_name || DEFAULT_USER;

    if (isPg) {
        // PostgreSQL: UPDATE ... RETURNING id atomically updates and returns the id.
        // If the row was deleted by a concurrent expunge, 0 rows are returned.
        // Fetch the existing previous_hash to preserve the hash chain.
        const selectQuery = `SELECT id, previous_hash FROM ${prefix}transactions WHERE order_id = $1 AND payment_method != $2 FOR UPDATE`;
        const [selectRows] = await connection.execute(selectQuery, [transaction.order_id, EXPUNGED_KEYWORD]);
        const existingRows = selectRows as (IdRow & { previous_hash: string | null })[];

        if (existingRows.length === 0) {
            // Transaction was deleted — insert fresh
            await insertTransactionWithItems(connection, transaction);
            return;
        }

        const transactionId = existingRows[0].id;
        const existingPreviousHash = existingRows[0].previous_hash;
        const hash = generateTransactionHash(transaction, transactionId, existingPreviousHash ?? undefined);

        const updateQuery = `
            UPDATE ${prefix}transactions
            SET customer_name = $1, user_name = $2, payment_method = $3, amount = $4, currency = $5, change = $6, take_out = $7, employer_share = $8, fidelity_points = $9, device_id = $10, payments = $11, hash = $12, updated_at = $13
            WHERE id = $14
        `;
        await connection.execute(updateQuery, [
            transaction.customer_name ?? null,
            userName,
            transaction.payment_method,
            transaction.amount,
            transaction.currency,
            transaction.change || null,
            transaction.takeOut ?? false,
            transaction.employer_share ?? null,
            transaction.fidelity_points ?? null,
            transaction.device_id ?? null,
            encodePaymentLegs(transaction.payments ?? []) ?? null,
            hash,
            transaction.updated_at,
            transactionId,
        ]);

        // Capture prior items and log an audit event before replacing them,
        // so there is a traceable record of what was there before the sync.
        await captureItemRevisionAudit(connection, transactionId, transaction);

        // Delete old items and re-insert
        const deleteQuery = `DELETE FROM ${prefix}transaction_items WHERE transaction_id = $1`;
        await connection.execute(deleteQuery, [transactionId]);
        await insertTransactionItems(connection, transactionId, transaction.products);

        // Rechain all subsequent transactions since this transaction's hash changed
        await rechainFrom(connection, transactionId);
    } else {
        // MariaDB/MySQL: no RETURNING clause, use SELECT ... FOR UPDATE to lock the row
        const lockQuery = `SELECT id, previous_hash FROM ${prefix}transactions WHERE order_id = ? AND payment_method != ? FOR UPDATE`;
        const [existing] = await connection.execute(lockQuery, [transaction.order_id, EXPUNGED_KEYWORD]);
        const existingRows = existing as (IdRow & { previous_hash: string | null })[];

        if (existingRows.length === 0) {
            // Transaction was deleted — insert fresh
            await insertTransactionWithItems(connection, transaction);
            return;
        }

        const transactionId = existingRows[0].id;
        const existingPreviousHash = existingRows[0].previous_hash;
        const hash = generateTransactionHash(transaction, transactionId, existingPreviousHash ?? undefined);

        const updateQuery = `
            UPDATE ${prefix}transactions
            SET customer_name = ?, user_name = ?, payment_method = ?, amount = ?, currency = ?, change = ?, take_out = ?, employer_share = ?, fidelity_points = ?, device_id = ?, payments = ?, hash = ?, updated_at = ?
            WHERE id = ?
        `;
        await connection.execute(updateQuery, [
            transaction.customer_name ?? null,
            userName,
            transaction.payment_method,
            transaction.amount,
            transaction.currency,
            transaction.change || null,
            transaction.takeOut ?? false,
            transaction.employer_share ?? null,
            transaction.fidelity_points ?? null,
            transaction.device_id ?? null,
            encodePaymentLegs(transaction.payments ?? []) ?? null,
            hash,
            transaction.updated_at,
            transactionId,
        ]);

        // Capture prior items and log an audit event before replacing them,
        // so there is a traceable record of what was there before the sync.
        await captureItemRevisionAudit(connection, transactionId, transaction);

        // Delete old items and re-insert
        const deleteQuery = `DELETE FROM ${prefix}transaction_items WHERE transaction_id = ?`;
        await connection.execute(deleteQuery, [transactionId]);
        await insertTransactionItems(connection, transactionId, transaction.products);

        // Rechain all subsequent transactions since this transaction's hash changed
        await rechainFrom(connection, transactionId);
    }
}

/**
 * Before item replacement during sync, fetch the existing items and log an
 * audit event capturing the prior item set. This ensures that even though the
 * old rows are physically deleted, a traceable record of what they contained
 * survives in the audit chain.
 *
 * The audit event is only logged if there were existing items.
 */
async function captureItemRevisionAudit(
    connection: Connection,
    transactionId: number | string,
    transaction: TransactionData
): Promise<void> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    const fetchQuery = isPg
        ? `SELECT label, quantity, amount, total, vat_rate, discount_amount FROM ${prefix}transaction_items WHERE transaction_id = $1 ORDER BY id`
        : `SELECT label, quantity, amount, total, vat_rate, discount_amount FROM ${prefix}transaction_items WHERE transaction_id = ? ORDER BY id`;

    const [rows] = await connection.execute(fetchQuery, [transactionId]);
    const existingItems = rows as {
        label: string;
        quantity: number | string;
        amount: number | string;
        total: number | string;
        vat_rate: number | string | null;
        discount_amount: number | string | null;
    }[];

    if (existingItems.length === 0) return;

    // Log the prior item set as an audit event so the history is traceable
    await insertAuditEvent(connection, {
        event_type: 'transaction_items_replaced',
        entity_type: 'transaction',
        entity_id: String(transactionId),
        user_name: transaction.user_name || DEFAULT_USER,
        device_id: transaction.device_id ?? null,
        detail: JSON.stringify({
            transaction_id: transactionId,
            order_id: transaction.order_id,
            prior_items: existingItems,
            new_item_count: transaction.products?.length ?? 0,
        }),
    });
}

export { computeFidelityDelta };

/**
 * Idempotent fidelity update for add/sync: reverse the old delta, then apply the new delta.
 * If the transaction is unchanged, old delta and new delta cancel out → net zero.
 */
async function updateCustomerFidelityPointsIdempotent(
    connection: Connection,
    transaction: TransactionData,
    oldData: OldFidelityData | null
): Promise<void> {
    const customerName = transaction.customer_name?.trim();
    if (!customerName) return;

    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Fetch fidelity rate once
    const paramQuery = isPg
        ? `SELECT param_value FROM ${prefix}parameters WHERE param_key = $1`
        : `SELECT param_value FROM parameters WHERE param_key = ?`;
    const [paramRows] = await connection.execute(paramQuery, ['fidelityRate']);
    const fidelityRate = Number((paramRows as { param_value: string }[])[0]?.param_value ?? 0);

    // Compute new delta
    const newDelta = computeFidelityDelta(
        transaction.payment_method,
        transaction.amount,
        transaction.fidelity_points ?? 0,
        fidelityRate,
        Boolean(transaction.products?.length)
    );

    // Compute reversal of old delta (if transaction already existed)
    let reversalDelta = 0;
    if (oldData) {
        reversalDelta = computeFidelityDelta(
            oldData.payment_method,
            oldData.amount,
            oldData.fidelity_points ?? 0,
            fidelityRate,
            Boolean(oldData.has_items)
        );
        // Reversal means undo → negate the original delta
        reversalDelta = -reversalDelta;
    }

    const totalDelta = reversalDelta + newDelta;
    if (totalDelta === 0) return;

    // Look up the customer by full name (LIMIT 1 for safety with duplicates)
    const customerQuery = isPg
        ? `SELECT id, fidelity_points FROM ${prefix}customers WHERE first_name || ' ' || last_name = $1 LIMIT 1 FOR UPDATE`
        : `SELECT id, fidelity_points FROM customers WHERE CONCAT(first_name, ' ', last_name) = ? LIMIT 1 FOR UPDATE`;
    const [customerRows] = await connection.execute(customerQuery, [customerName]);
    const customerRow = (customerRows as (IdRow & { fidelity_points: number | string })[])[0];
    if (!customerRow) return;

    const customerId = customerRow.id;
    const currentBalance = Number(customerRow.fidelity_points ?? 0);

    // Clamp: don't let balance go negative
    let delta = totalDelta;
    const newBalance = currentBalance + delta;
    if (newBalance < 0) {
        delta = -currentBalance;
        if (delta === 0) return;
    }

    const updateQuery = isPg
        ? `UPDATE ${prefix}customers SET fidelity_points = fidelity_points + $1 WHERE id = $2`
        : `UPDATE customers SET fidelity_points = fidelity_points + ? WHERE id = ?`;
    await connection.execute(updateQuery, [delta, customerId]);
}

/**
 * Update the customer's fidelity_points balance based on the transaction.
 * Used for delete/expunge (isReversal=true) to reverse the original delta.
 */
async function updateCustomerFidelityPoints(
    connection: Connection,
    transaction: TransactionData,
    isReversal: boolean,
    hasProducts = true
): Promise<void> {
    const customerName = transaction.customer_name?.trim();
    if (!customerName) return;

    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Fetch fidelity rate
    const paramQuery = isPg
        ? `SELECT param_value FROM ${prefix}parameters WHERE param_key = $1`
        : `SELECT param_value FROM parameters WHERE param_key = ?`;
    const [paramRows] = await connection.execute(paramQuery, ['fidelityRate']);
    const fidelityRate = Number((paramRows as { param_value: string }[])[0]?.param_value ?? 0);

    const delta = computeFidelityDelta(
        transaction.payment_method,
        transaction.amount,
        transaction.fidelity_points ?? 0,
        fidelityRate,
        hasProducts
    );

    // For reversal, negate the delta
    const totalDelta = isReversal ? -delta : delta;
    if (totalDelta === 0) return;

    // Look up the customer by full name (LIMIT 1 for safety with duplicates)
    const customerQuery = isPg
        ? `SELECT id, fidelity_points FROM ${prefix}customers WHERE first_name || ' ' || last_name = $1 LIMIT 1 FOR UPDATE`
        : `SELECT id, fidelity_points FROM customers WHERE CONCAT(first_name, ' ', last_name) = ? LIMIT 1 FOR UPDATE`;
    const [customerRows] = await connection.execute(customerQuery, [customerName]);
    const customerRow = (customerRows as (IdRow & { fidelity_points: number | string })[])[0];
    if (!customerRow) return;

    const customerId = customerRow.id;
    const currentBalance = Number(customerRow.fidelity_points ?? 0);

    // Clamp: don't let balance go negative
    let clampedDelta = totalDelta;
    const newBalance = currentBalance + clampedDelta;
    if (newBalance < 0) {
        clampedDelta = -currentBalance;
        if (clampedDelta === 0) return;
    }

    const updateQuery = isPg
        ? `UPDATE ${prefix}customers SET fidelity_points = fidelity_points + $1 WHERE id = $2`
        : `UPDATE customers SET fidelity_points = fidelity_points + ? WHERE id = ?`;
    await connection.execute(updateQuery, [clampedDelta, customerId]);
}
