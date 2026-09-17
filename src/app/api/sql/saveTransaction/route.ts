import {
    PROCESSING_KEYWORD,
    WAITING_KEYWORD,
    UPDATING_KEYWORD,
    DEFAULT_USER,
    DEFAULT_VAT_RATE,
    EXPUNGED_KEYWORD,
} from '@/app/utils/constants';
import { computeFidelityDelta } from '@/app/utils/fidelity';
import { getShopIdFromRequest } from '@/app/constants/shop';
import { assertDeviceAuthorized } from '../deviceAuth';
import { readSubscription, stoppedSubscriptionResponse } from '../subscriptionStore';
import { SUBSCRIPTION_PLANS } from '@/app/utils/subscription';
import { NextResponse } from 'next/server';
import { Connection, getPosDb, shopLocalToday } from '../db';
import { cached } from '../apiCache';
import { insertAuditEvent, lockHashChain } from '../auditHelpers';
import { computeTransactionHash, type TransactionItemHashInput } from '@/app/utils/transactionHash';
import { encodePaymentLegs } from '@/app/utils/transactionNote';
import { rechainFrom } from '../hashChain';
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
    let body: { action: string; transaction: TransactionData; client_date?: string };
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
            const deviceGuard = await assertDeviceAuthorized(request, shopId, undefined, connection);
            if (deviceGuard) return deviceGuard;
            const sub = await readSubscription(connection);
            if (sub.status === 'stopped') {
                return stoppedSubscriptionResponse();
            }
            // Fidelity balance updates touch the customers table — a feature
            // absent from the Découverte plan. Skip them entirely (apply AND
            // reversal) when the plan doesn't include customers.
            const canUpdateFidelity = SUBSCRIPTION_PLANS[sub.plan].limits.customers;

            await connection.beginTransaction();
            // Serialize writers on the transaction hash chain — a concurrent
            // save reading the same tail hash would fork the chain.
            const unlockChain = await lockHashChain(connection, 'nf525_transactions');

            try {
                // One row fetch keyed by order_id feeds the fidelity prefetch,
                // the sealed-day check and the add/sync existence test —
                // three round trips collapsed into one.
                const existingRow = await fetchExistingRow(connection, transaction.order_id);

                // Fetch the OLD transaction's fidelity-relevant fields BEFORE the handler
                // overwrites or removes the row. For add/sync this lets us reverse the
                // previously applied delta so re-syncing is idempotent; for delete/expunge
                // it tells us whether the row had items (item-less provisions never earn).
                let oldFidelityData: OldFidelityData | null = null;
                if (
                    existingRow &&
                    (action === 'add' || action === 'sync' || action === 'delete' || action === 'expunge')
                ) {
                    oldFidelityData = {
                        payment_method: existingRow.payment_method,
                        amount: Number(existingRow.amount),
                        customer_name: existingRow.customer_name,
                        fidelity_points:
                            existingRow.fidelity_points != null ? Number(existingRow.fidelity_points) : null,
                        has_items:
                            existingRow.has_items === true ||
                            existingRow.has_items === 1 ||
                            existingRow.has_items === '1',
                    };
                }

                // NF525 sealed day: a daily closure anchors on the day's
                // transaction hashes and totals — any insert or mutation
                // dated in a closed day would silently break the seal (the
                // rechain would rewrite the anchored hashes). Reject it:
                // corrections on a closed day must be new transactions
                // dated in the open day.
                const sealed = await sealedClosedDay(connection, transaction, existingRow, body.client_date);
                if (sealed) {
                    await connection.rollback();
                    await unlockChain();
                    return NextResponse.json(
                        {
                            error: `${sealed.label} — l'écriture a été refusée`,
                            code: 'DAY_CLOSED',
                            closedDay: sealed.day,
                        },
                        { status: 409 }
                    );
                }

                // add/sync report whether anything was actually written — an
                // identical re-sync is a no-op, so the fidelity reconciliation
                // below (provably net-zero on unchanged rows) is skipped too.
                let changed = true;
                switch (action) {
                    case 'add': {
                        changed = await handleAddTransaction(connection, transaction, existingRow);
                        if (changed) {
                            await insertAuditEvent(connection, {
                                event_type: 'transaction_add',
                                entity_id: transaction.order_id,
                                user_name: transaction.user_name || DEFAULT_USER,
                                device_id: transaction.device_id ?? null,
                                detail: `amount=${transaction.amount} method=${transaction.payment_method}`,
                            });
                        }
                        break;
                    }
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
                        await handleDeleteTransaction(connection, transaction, existingRow);
                        await insertAuditEvent(connection, {
                            event_type: 'transaction_delete',
                            entity_id: transaction.order_id,
                            user_name: transaction.user_name || DEFAULT_USER,
                            device_id: transaction.device_id ?? null,
                            detail: `method=${transaction.payment_method}`,
                        });
                        break;
                    case 'expunge':
                        await handleExpungeTransaction(connection, transaction, existingRow);
                        await insertAuditEvent(connection, {
                            event_type: 'transaction_expunge',
                            entity_id: transaction.order_id,
                            user_name: transaction.user_name || DEFAULT_USER,
                            device_id: transaction.device_id ?? null,
                            detail: `permanent deletion of order_id=${transaction.order_id}`,
                        });
                        break;
                    case 'sync': {
                        changed = await handleSyncTransaction(connection, transaction);
                        if (changed) {
                            await insertAuditEvent(connection, {
                                event_type: 'transaction_sync',
                                entity_id: transaction.order_id,
                                user_name: transaction.user_name || DEFAULT_USER,
                                device_id: transaction.device_id ?? null,
                                detail: `amount=${transaction.amount} method=${transaction.payment_method}`,
                            });
                        }
                        break;
                    }
                    default:
                        throw new Error(`Unknown action: ${action}`);
                }

                // Update customer fidelity points after the transaction is saved.
                // - 'add'/'sync': reverse any previously applied delta, then apply the new delta.
                //   This makes fidelity crediting idempotent: re-syncing the same transaction
                //   produces a net-zero delta (old reversed + new applied = 0 if unchanged).
                // - 'delete'/'expunge': reverse the original delta (restore points)
                // - 'update': just marks as PROCESSING, no point change
                if ((action === 'add' || action === 'sync') && canUpdateFidelity && changed) {
                    await updateCustomerFidelityPointsIdempotent(connection, transaction, oldFidelityData);
                } else if ((action === 'delete' || action === 'expunge') && canUpdateFidelity) {
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

// The row shared by the fidelity prefetch, the sealed-day check and the
// add/sync existence test — one SELECT keyed by order_id serves all three.
interface ExistingTxRow {
    id: number;
    payment_method: string;
    amount: number | string;
    customer_name: string | null;
    fidelity_points: number | string | null;
    d: string | null;
    has_items: boolean | number | string;
}

async function fetchExistingRow(connection: Connection, orderId: string): Promise<ExistingTxRow | null> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const [rows] = await connection.execute(
        isPg
            ? `SELECT id, payment_method, amount, customer_name, fidelity_points, to_char(created_at, 'YYYY-MM-DD') AS d, EXISTS (SELECT 1 FROM ${prefix}transaction_items ti WHERE ti.transaction_id = t.id) AS has_items FROM ${prefix}transactions t WHERE t.order_id = $1`
            : `SELECT id, payment_method, amount, customer_name, fidelity_points, DATE_FORMAT(created_at, '%Y-%m-%d') AS d, EXISTS (SELECT 1 FROM transaction_items ti WHERE ti.transaction_id = t.id) AS has_items FROM transactions t WHERE t.order_id = ?`,
        [orderId]
    );
    return (rows as ExistingTxRow[])[0] ?? null;
}

async function handleAddTransaction(
    connection: Connection,
    transaction: TransactionData,
    existing: ExistingTxRow | null
): Promise<boolean> {
    // Existence is checked by order_id — millisecond precision, unique per
    // transaction. Using created_at is unsafe because toSQLDateTime truncates
    // to seconds, causing two transactions within the same second to collide
    // and overwrite each other.
    if (existing) {
        // Transaction already exists — sync it (update + replace items)
        return await handleSyncTransaction(connection, transaction);
    }

    // No existing transaction — insert a new one + items
    await insertTransactionWithItems(connection, transaction);
    return true;
}

/**
 * Returns the closure date (YYYY-MM-DD) sealing this write, or null.
 *
 * A daily closure's hash covers the day's first/last paid transaction
 * hashes (and the day's totals). Two distinct rules apply:
 *
 * - Mutation of an existing row (update/delete/expunge, or add/sync hitting
 *   a live row): the rechain rewrites the target's hash AND every later
 *   row's hash — so ANY closure dated on/after the row's day is violated,
 *   not just a closure of the row's own day. Sealed iff a closure exists
 *   with closure_date >= row day.
 * - Fresh insert (new row appended at the chain tail, or add/sync where the
 *   existing row is EXPUNGED and invisible): no existing hash is rewritten,
 *   but a row dated inside a closed day falsifies that day's sealed totals.
 *   Sealed iff a closure exists with closure_date == payload day.
 *
 * The stored row's created_at governs mutations (sync never rewrites
 * created_at); a fresh insert is governed by the date it claims.
 */
const draftMethodSet = new Set([PROCESSING_KEYWORD, WAITING_KEYWORD, UPDATING_KEYWORD]);

// sealedClosedDay returns the sealed day plus a French label for the sealing
// period, or null when the write is allowed. `existing` is the shared row
// fetch (fetchExistingRow) — the only query here resolves the three seals.
async function sealedClosedDay(
    connection: Connection,
    transaction: TransactionData,
    existing: ExistingTxRow | null,
    clientDate?: string
): Promise<{ day: string; label: string } | null> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    const existingGoverns = existing !== null && existing.payment_method !== EXPUNGED_KEYWORD;
    const dateStr = existingGoverns ? existing.d : transaction.created_at.slice(0, 10);
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

    // One query resolves all three seals — the daily check returns the
    // earliest closure on/after the day: for a mutation that minimum seals
    // the write directly; for a fresh insert it seals only when it IS the
    // payload's day (a future closure doesn't forbid inserting today).
    const [sealRows] = await connection.execute(
        isPg
            ? `SELECT (SELECT to_char(MIN(closure_date), 'YYYY-MM-DD') FROM ${prefix}daily_closures WHERE closure_date >= $1::date) AS min_daily,
                      EXISTS(SELECT 1 FROM ${prefix}monthly_closures WHERE closure_month = $2::date) AS month_sealed,
                      EXISTS(SELECT 1 FROM ${prefix}annual_closures WHERE closure_year = $3) AS year_sealed`
            : `SELECT (SELECT DATE_FORMAT(MIN(closure_date), '%Y-%m-%d') FROM ${prefix}daily_closures WHERE closure_date >= ?) AS min_daily,
                      EXISTS(SELECT 1 FROM ${prefix}monthly_closures WHERE closure_month = ?) AS month_sealed,
                      EXISTS(SELECT 1 FROM ${prefix}annual_closures WHERE closure_year = ?) AS year_sealed`,
        [dateStr, `${dateStr.slice(0, 7)}-01`, Number(dateStr.slice(0, 4))]
    );
    const seals = (
        sealRows as { min_daily: string | null; month_sealed: boolean | number; year_sealed: boolean | number }[]
    )[0];

    // A closure can only seal a fully elapsed period: a daily closure dated
    // after today, or a monthly/annual closure of the in-progress period, is
    // bogus data (e.g. left behind by a migration script) and must not block
    // writes — a legitimate closure cannot have been created yet. "Today" is
    // the shop's client-local day (bounded), since a legitimate closure can
    // now be created for the local day during the 00:00–02:00 UTC lag.
    const serverToday = shopLocalToday(clientDate);
    const dailySeal = seals?.min_daily && seals.min_daily <= serverToday ? seals.min_daily : null;
    const periodLabel =
        seals?.month_sealed && dateStr.slice(0, 7) < serverToday.slice(0, 7)
            ? `Le mois ${dateStr.slice(0, 7)} est clôturé`
            : seals?.year_sealed && Number(dateStr.slice(0, 4)) < Number(serverToday.slice(0, 4))
              ? `L'année ${dateStr.slice(0, 4)} est clôturée`
              : null;

    if (existingGoverns) {
        // Mutation: sealed by the earliest closure on/after the row's day —
        // its anchored hashes (and every later closure's) would be rewritten.
        if (dailySeal) return { day: dateStr, label: `La journée du ${dailySeal} est clôturée` };

        // Finalizing a draft is new revenue on the stored day — apply the
        // period seal too so it can't land inside a closed month/year where
        // the day itself was never closed.
        if (
            periodLabel &&
            draftMethodSet.has(existing.payment_method) &&
            !draftMethodSet.has(transaction.payment_method)
        ) {
            return { day: dateStr, label: periodLabel };
        }
        return null;
    }

    // Fresh insert: a daily closure of the payload day seals it; a sealed
    // month/year means this day can never be closed — revenue dated there
    // escapes every Z-ticket.
    if (dailySeal === dateStr) return { day: dateStr, label: `La journée du ${dateStr} est clôturée` };
    if (periodLabel) return { day: dateStr, label: periodLabel };
    return null;
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

    // One multi-row INSERT — a single remote round trip instead of one per
    // product (~150-400 ms each against the hosted DB).
    const values: unknown[] = [];
    const tuples = products.map((product) => {
        values.push(
            transactionId,
            product.label,
            product.category,
            product.amount,
            product.quantity,
            product.discount_amount || 0,
            product.discount_unit || '',
            product.total,
            product.vat_rate ?? DEFAULT_VAT_RATE
        );
        const b = values.length - 9;
        return isPg
            ? `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9})`
            : '(?, ?, ?, ?, ?, ?, ?, ?, ?)';
    });

    await connection.execute(
        `INSERT INTO ${prefix}transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total, vat_rate) VALUES ${tuples.join(', ')}`,
        values
    );
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

async function handleDeleteTransaction(
    connection: Connection,
    transaction: TransactionData,
    existingRow: ExistingTxRow | null
) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Save the new payment_method (DELETED_KEYWORD or CANCELLED_KEYWORD) before
    // restoring the original DB values for the fidelity reversal.
    const newPaymentMethod = transaction.payment_method;

    // Restore the original transaction data (for fidelity point reversal) before marking as deleted
    restoreOriginalForFidelity(transaction, existingRow);

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

async function handleExpungeTransaction(
    connection: Connection,
    transaction: TransactionData,
    existingRow: ExistingTxRow | null
) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Restore the original transaction data (for fidelity point reversal) before marking as expunged
    restoreOriginalForFidelity(transaction, existingRow);

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

// Populate fidelity-relevant fields on the incoming transaction from the
// shared row fetch, so updateCustomerFidelityPoints can compute the reversal.
// The client may not send fidelity_points/amount/payment_method for delete actions.
function restoreOriginalForFidelity(transaction: TransactionData, original: ExistingTxRow | null) {
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

// Returns true when the row was actually written — an unchanged re-sync
// leaves the hash identical, so the whole update+rechain is skipped: a
// rechain rewrites every later row under the hash-chain lock, and unchanged
// re-syncs are the common case (idempotent pushes, retries).
async function handleSyncTransaction(connection: Connection, transaction: TransactionData): Promise<boolean> {
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
        const selectQuery = `SELECT id, previous_hash, hash FROM ${prefix}transactions WHERE order_id = $1 AND payment_method != $2 FOR UPDATE`;
        const [selectRows] = await connection.execute(selectQuery, [transaction.order_id, EXPUNGED_KEYWORD]);
        const existingRows = selectRows as (IdRow & { previous_hash: string | null; hash: string | null })[];

        if (existingRows.length === 0) {
            // Transaction was deleted — insert fresh
            await insertTransactionWithItems(connection, transaction);
            return true;
        }

        const transactionId = existingRows[0].id;
        const existingPreviousHash = existingRows[0].previous_hash;
        const hash = generateTransactionHash(transaction, transactionId, existingPreviousHash ?? undefined);

        // Identical re-sync: the stored hash already covers this payload —
        // no UPDATE, no item rewrite, no rechain, no audit noise.
        if (hash === existingRows[0].hash) return false;

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

        // Replace the items only when they actually changed — an unchanged
        // re-sync must not churn rows nor emit a spurious audit event.
        await replaceItemsIfChanged(connection, transactionId, transaction);

        // Rechain all subsequent transactions since this transaction's hash changed
        await rechainFrom(connection, transactionId);
        return true;
    } else {
        // MariaDB/MySQL: no RETURNING clause, use SELECT ... FOR UPDATE to lock the row
        const lockQuery = `SELECT id, previous_hash, hash FROM ${prefix}transactions WHERE order_id = ? AND payment_method != ? FOR UPDATE`;
        const [existing] = await connection.execute(lockQuery, [transaction.order_id, EXPUNGED_KEYWORD]);
        const existingRows = existing as (IdRow & { previous_hash: string | null; hash: string | null })[];

        if (existingRows.length === 0) {
            // Transaction was deleted — insert fresh
            await insertTransactionWithItems(connection, transaction);
            return true;
        }

        const transactionId = existingRows[0].id;
        const existingPreviousHash = existingRows[0].previous_hash;
        const hash = generateTransactionHash(transaction, transactionId, existingPreviousHash ?? undefined);

        // Identical re-sync — see the PG branch.
        if (hash === existingRows[0].hash) return false;

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

        // Replace the items only when they actually changed — an unchanged
        // re-sync must not churn rows nor emit a spurious audit event.
        await replaceItemsIfChanged(connection, transactionId, transaction);

        // Rechain all subsequent transactions since this transaction's hash changed
        await rechainFrom(connection, transactionId);
        return true;
    }
}

/**
 * Replace a transaction's items during sync — but only when they changed.
 *
 * Items are physically deleted and re-inserted (the schema grants no UPDATE
 * on transaction_items). Before replacing, the stored set is compared to the
 * incoming one over every persisted column: an unchanged re-sync skips the
 * rewrite entirely, avoiding row churn and a spurious audit event.
 *
 * When items are replaced, the prior set is logged as a
 * `transaction_items_replaced` audit event so a traceable record of what was
 * there survives the deletion.
 */
async function replaceItemsIfChanged(
    connection: Connection,
    transactionId: number | string,
    transaction: TransactionData
): Promise<void> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    const fetchQuery = isPg
        ? `SELECT label, category, quantity, amount, total, vat_rate, discount_amount, discount_unit FROM ${prefix}transaction_items WHERE transaction_id = $1 ORDER BY id`
        : `SELECT label, category, quantity, amount, total, vat_rate, discount_amount, discount_unit FROM ${prefix}transaction_items WHERE transaction_id = ? ORDER BY id`;

    const [rows] = await connection.execute(fetchQuery, [transactionId]);
    const existingItems = rows as {
        label: string;
        category: string | null;
        quantity: number | string;
        amount: number | string;
        total: number | string;
        vat_rate: number | string | null;
        discount_amount: number | string | null;
        discount_unit: string | null;
    }[];

    // Canonical form of an item set: one normalized tuple per row, sorted.
    // Normalization mirrors insertTransactionItems' write conventions
    // (defaults for discount/VAT), so "same logical items" ⇒ same fingerprint.
    const fingerprint = (
        items: {
            label: string;
            category?: string | null;
            quantity: number | string;
            amount: number | string;
            total: number | string;
            vat_rate?: number | string | null;
            discount_amount?: number | string | null;
            discount_unit?: string | null;
        }[]
    ) =>
        JSON.stringify(
            items
                .map((i) => [
                    String(i.label ?? ''),
                    String(i.category ?? ''),
                    Number(i.amount) || 0,
                    Number(i.quantity) || 0,
                    Number(i.discount_amount) || 0,
                    i.discount_unit || '',
                    Number(i.total) || 0,
                    i.vat_rate == null ? DEFAULT_VAT_RATE : Number(i.vat_rate),
                ])
                .sort()
        );

    const incomingItems = (transaction.products ?? []).map((p) => ({
        label: p.label,
        category: p.category,
        quantity: p.quantity,
        amount: p.amount,
        total: p.total,
        vat_rate: p.vat_rate,
        discount_amount: p.discount_amount,
        discount_unit: p.discount_unit,
    }));

    if (fingerprint(existingItems) === fingerprint(incomingItems)) return;

    if (existingItems.length > 0) {
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

    const deleteQuery = `DELETE FROM ${prefix}transaction_items WHERE transaction_id = ${isPg ? '$1' : '?'}`;
    await connection.execute(deleteQuery, [transactionId]);
    await insertTransactionItems(connection, transactionId, transaction.products);
}

// fidelityRate barely changes — cache it (~30 s) so it doesn't cost a remote
// round trip on every sale. updateParameters invalidates the 'param:' family.
// No shopId → single-shop local mode: skip the cache rather than keying on ''.
async function fetchFidelityRate(connection: Connection): Promise<number> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const loadRate = async () => {
        const [paramRows] = await connection.execute(
            isPg
                ? `SELECT param_value FROM ${prefix}parameters WHERE param_key = $1`
                : `SELECT param_value FROM parameters WHERE param_key = ?`,
            ['fidelityRate']
        );
        return Number((paramRows as { param_value: string }[])[0]?.param_value ?? 0);
    };
    const shopId = connection.shopId;
    if (!shopId) return loadRate();
    return cached(`param:${shopId}:fidelityRate`, loadRate);
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
    const fidelityRate = await fetchFidelityRate(connection);

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
    const fidelityRate = await fetchFidelityRate(connection);

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
