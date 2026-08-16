import {
    DELETED_KEYWORD,
    PROCESSING_KEYWORD,
    DEFAULT_USER,
    DEFAULT_VAT_RATE,
    REFUND_KEYWORD,
    WAITING_KEYWORD,
    UPDATING_KEYWORD,
} from '@/app/utils/constants';
import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { Connection, getPosDb } from '../db';

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
    created_at: string;
    updated_at: string;
    products?: TransactionProduct[];
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
    } catch (error) {
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

            await connection.beginTransaction();

            try {
                switch (action) {
                    case 'add':
                        await handleAddTransaction(connection, transaction);
                        break;
                    case 'update':
                        await handleUpdateTransaction(connection, transaction);
                        break;
                    case 'delete':
                        await handleDeleteTransaction(connection, transaction);
                        break;
                    case 'hardDelete':
                        await handleHardDeleteTransaction(connection, transaction);
                        break;
                    case 'sync':
                        await handleSyncTransaction(connection, transaction);
                        break;
                    default:
                        throw new Error(`Unknown action: ${action}`);
                }

                // Update customer fidelity points after the transaction is saved.
                // - 'add'/'sync': apply the transaction's point delta (earn/deduct)
                // - 'delete'/'hardDelete': reverse the delta (restore points)
                // - 'update': just marks as PROCESSING, no point change
                if (action === 'add' || action === 'sync') {
                    await updateCustomerFidelityPoints(connection, transaction, false);
                } else if (action === 'delete' || action === 'hardDelete') {
                    await updateCustomerFidelityPoints(connection, transaction, true);
                }

                await connection.commit();
                await connection.end();

                return NextResponse.json({ success: true, message: 'Transaction saved successfully' }, { status: 200 });
            } catch (error) {
                await connection.rollback();
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

export function generateTransactionHash(transaction: TransactionData, transactionId?: string | number): string {
    // Generate a hash from transaction data for integrity verification
    const data = [
        transactionId || 'new',
        transaction.order_id,
        transaction.user_name,
        transaction.payment_method,
        transaction.amount,
        transaction.currency,
        transaction.created_at,
        transaction.change || '',
    ].join('|');

    // Simple hash function for demo - in production use crypto
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
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

// Insert a new transaction row and its items. Returns the transaction id.
async function insertTransactionWithItems(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    const userName = transaction.user_name || DEFAULT_USER;
    const hash = generateTransactionHash(transaction);

    const insertTransactionQuery = isPg
        ? `
        INSERT INTO ${prefix}transactions (order_id, customer_name, user_name, payment_method, amount, currency, change, take_out, employer_share, fidelity_points, hash, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
    `
        : `
        INSERT INTO ${prefix}transactions (order_id, customer_name, user_name, payment_method, amount, currency, change, take_out, employer_share, fidelity_points, hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        hash,
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

async function handleUpdateTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Update the transaction record to mark it as processing (lookup by order_id —
    // millisecond precision, unique per transaction)
    const updateQuery = isPg
        ? `UPDATE ${prefix}transactions SET payment_method = $1, updated_at = $2 WHERE order_id = $3`
        : `UPDATE ${prefix}transactions SET payment_method = ?, updated_at = ? WHERE order_id = ?`;

    await connection.execute(updateQuery, [PROCESSING_KEYWORD, transaction.updated_at, transaction.order_id]);
}

async function handleDeleteTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Fetch the original transaction data (for fidelity point reversal) before marking as deleted
    await fetchOriginalTransactionForFidelity(connection, transaction);

    // Update the transaction record to mark it as deleted (lookup by order_id)
    const updateQuery = isPg
        ? `UPDATE ${prefix}transactions SET payment_method = $1, updated_at = $2 WHERE order_id = $3`
        : `UPDATE ${prefix}transactions SET payment_method = ?, updated_at = ? WHERE order_id = ?`;

    await connection.execute(updateQuery, [DELETED_KEYWORD, transaction.updated_at, transaction.order_id]);
}

async function handleHardDeleteTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Fetch the original transaction data (for fidelity point reversal) before hard-deleting
    await fetchOriginalTransactionForFidelity(connection, transaction);

    // Completely delete the transaction and its items from the database
    const findQuery = isPg
        ? `SELECT id FROM ${prefix}transactions WHERE order_id = $1`
        : `SELECT id FROM ${prefix}transactions WHERE order_id = ?`;
    const [rows] = await connection.execute(findQuery, [transaction.order_id]);
    const idRows = rows as IdRow[];

    if (idRows.length > 0) {
        const txId = idRows[0].id;

        const deleteItemsQuery = isPg
            ? `DELETE FROM ${prefix}transaction_items WHERE transaction_id = $1`
            : `DELETE FROM ${prefix}transaction_items WHERE transaction_id = ?`;
        await connection.execute(deleteItemsQuery, [txId]);

        const deleteTxQuery = isPg
            ? `DELETE FROM ${prefix}transactions WHERE id = $1`
            : `DELETE FROM ${prefix}transactions WHERE id = ?`;
        await connection.execute(deleteTxQuery, [txId]);
    }
}

// Fetch the original transaction from DB and populate fidelity-relevant fields on the
// incoming transaction object, so updateCustomerFidelityPoints can compute the reversal.
// The client may not send fidelity_points/amount/payment_method for delete actions.
async function fetchOriginalTransactionForFidelity(connection: Connection, transaction: TransactionData) {
    // If the client already provided fidelity_points, trust it
    if (transaction.fidelity_points != null) return;

    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = isPg
        ? `SELECT payment_method, amount, customer_name, fidelity_points FROM ${prefix}transactions WHERE order_id = $1`
        : `SELECT payment_method, amount, customer_name, fidelity_points FROM transactions WHERE order_id = ?`;
    const [rows] = await connection.execute(query, [transaction.order_id]);
    const original = (
        rows as (IdRow & {
            payment_method: string;
            amount: number | string;
            customer_name: string | null;
            fidelity_points: number | string | null;
        })[]
    )[0];

    if (original) {
        transaction.payment_method = original.payment_method;
        transaction.amount = Number(original.amount);
        transaction.customer_name = original.customer_name;
        transaction.fidelity_points = original.fidelity_points != null ? Number(original.fidelity_points) : null;
    }
}

async function handleSyncTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Use UPDATE ... RETURNING to atomically check-and-update.
    // This prevents a race condition where the transaction is hard-deleted by
    // a concurrent request between the SELECT and the item INSERT, which would
    // cause a foreign key violation.
    const userName = transaction.user_name || DEFAULT_USER;

    if (isPg) {
        // PostgreSQL: UPDATE ... RETURNING id atomically updates and returns the id.
        // If the row was deleted by a concurrent hardDelete, 0 rows are returned.
        const updateReturningQuery = `
            UPDATE ${prefix}transactions
            SET customer_name = $1, user_name = $2, payment_method = $3, amount = $4, currency = $5, change = $6, take_out = $7, employer_share = $8, fidelity_points = $9, hash = $10, updated_at = $11
            WHERE order_id = $12
            RETURNING id
        `;
        const hash = generateTransactionHash(transaction);
        const [rows] = await connection.execute(updateReturningQuery, [
            transaction.customer_name ?? null,
            userName,
            transaction.payment_method,
            transaction.amount,
            transaction.currency,
            transaction.change || null,
            transaction.takeOut ?? false,
            transaction.employer_share ?? null,
            transaction.fidelity_points ?? null,
            hash,
            transaction.updated_at,
            transaction.order_id,
        ]);
        const returnedRows = rows as IdRow[];

        if (returnedRows.length === 0) {
            // Transaction was deleted between our SELECT and UPDATE — insert fresh
            await insertTransactionWithItems(connection, transaction);
            return;
        }

        const transactionId = returnedRows[0].id;

        // Delete old items and re-insert
        const deleteQuery = `DELETE FROM ${prefix}transaction_items WHERE transaction_id = $1`;
        await connection.execute(deleteQuery, [transactionId]);
        await insertTransactionItems(connection, transactionId, transaction.products);
    } else {
        // MariaDB/MySQL: no RETURNING clause, use SELECT ... FOR UPDATE to lock the row
        const lockQuery = `SELECT id FROM ${prefix}transactions WHERE order_id = ? FOR UPDATE`;
        const [existing] = await connection.execute(lockQuery, [transaction.order_id]);
        const existingRows = existing as IdRow[];

        if (existingRows.length === 0) {
            // Transaction was deleted — insert fresh
            await insertTransactionWithItems(connection, transaction);
            return;
        }

        const transactionId = existingRows[0].id;
        const hash = generateTransactionHash(transaction, transactionId);

        const updateQuery = `
            UPDATE ${prefix}transactions
            SET customer_name = ?, user_name = ?, payment_method = ?, amount = ?, currency = ?, change = ?, take_out = ?, employer_share = ?, fidelity_points = ?, hash = ?, updated_at = ?
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
            hash,
            transaction.updated_at,
            transactionId,
        ]);

        // Delete old items and re-insert
        const deleteQuery = `DELETE FROM ${prefix}transaction_items WHERE transaction_id = ?`;
        await connection.execute(deleteQuery, [transactionId]);
        await insertTransactionItems(connection, transactionId, transaction.products);
    }
}

// Fidelity points keywords that should not earn points
const NON_EARNING_METHODS = [
    WAITING_KEYWORD,
    PROCESSING_KEYWORD,
    UPDATING_KEYWORD,
    DELETED_KEYWORD,
    'METTRE ' + WAITING_KEYWORD,
];

/**
 * Update the customer's fidelity_points balance based on the transaction.
 *
 * Normal add/sync:
 * - Normal payment with a customer: earns points = amount × fidelityRate / 100
 * - Refund with a customer: deducts points = |amount| × fidelityRate / 100, and restores used points
 * - Fidelity payment (fidelity_points used): deducts the used points
 *
 * Reversal (delete/hardDelete):
 * - Reverses whatever the original transaction did (restores earned points, restores used points)
 *
 * The fidelityRate is fetched from the parameters table (key 'fidelityRate').
 */
async function updateCustomerFidelityPoints(
    connection: Connection,
    transaction: TransactionData,
    isReversal: boolean
): Promise<void> {
    const customerName = transaction.customer_name?.trim();
    if (!customerName) return;

    const method = transaction.payment_method;
    const isRefund = method === REFUND_KEYWORD;
    const isNonEarning = NON_EARNING_METHODS.includes(method);
    const fidelityPointsUsed = transaction.fidelity_points ?? 0;

    // Nothing to do: no points used, and method doesn't earn/deduct points
    if (fidelityPointsUsed <= 0 && isNonEarning) return;

    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // 1. Look up the customer by full name
    const customerQuery = isPg
        ? `SELECT id, fidelity_points FROM ${prefix}customers WHERE first_name || ' ' || last_name = $1`
        : `SELECT id, fidelity_points FROM customers WHERE CONCAT(first_name, ' ', last_name) = ?`;
    const [customerRows] = await connection.execute(customerQuery, [customerName]);
    const customerRow = (customerRows as (IdRow & { fidelity_points: number | string })[])[0];
    if (!customerRow) return; // Customer not found, skip

    const customerId = customerRow.id;
    const currentBalance = Number(customerRow.fidelity_points ?? 0);

    // 2. Fetch the fidelity rate from parameters
    const paramQuery = isPg
        ? `SELECT value FROM ${prefix}parameters WHERE key = $1`
        : `SELECT value FROM parameters WHERE \`key\` = ?`;
    const [paramRows] = await connection.execute(paramQuery, ['fidelityRate']);
    const fidelityRate = Number((paramRows as { value: string }[])[0]?.value ?? 0);
    if (fidelityRate <= 0 && fidelityPointsUsed <= 0) return; // No rate and no points used

    // 3. Calculate the delta
    let delta = 0;

    // Points used (fidelity payment):
    // - Normal add: deduct used points
    // - Refund add: restore used points (add them back)
    // - Reversal (delete): reverse whatever the original did
    if (fidelityPointsUsed > 0) {
        if (isReversal) {
            // Reversing a normal payment: restore used points
            // Reversing a refund: deduct them again (undo the restore)
            delta += isRefund ? -fidelityPointsUsed : fidelityPointsUsed;
        } else if (isRefund) {
            // Refund: restore the points that were used
            delta += fidelityPointsUsed;
        } else {
            // Normal payment: deduct the used points
            delta -= fidelityPointsUsed;
        }
    }

    // Points earned on normal payments, or deducted on refunds
    if (!isNonEarning && fidelityRate > 0) {
        const amount = Math.abs(transaction.amount);
        const earnedPoints = (amount * fidelityRate) / 100;

        if (isReversal) {
            // Reversing: undo the earn/deduct
            delta += isRefund ? earnedPoints : -earnedPoints;
        } else {
            // Normal: earn on payment, deduct on refund
            delta += isRefund ? -earnedPoints : earnedPoints;
        }
    }

    if (delta === 0) return;

    // 4. Validate: don't let balance go negative from this operation
    const newBalance = currentBalance + delta;
    if (newBalance < 0) {
        // Clamp delta so balance doesn't go below 0 (shouldn't happen with proper validation,
        // but protects against edge cases like manual DB edits)
        delta = -currentBalance;
        if (delta === 0) return;
    }

    // 5. Update the customer's fidelity_points
    const updateQuery = isPg
        ? `UPDATE ${prefix}customers SET fidelity_points = fidelity_points + $1 WHERE id = $2`
        : `UPDATE customers SET fidelity_points = fidelity_points + ? WHERE id = ?`;
    await connection.execute(updateQuery, [delta, customerId]);
}
