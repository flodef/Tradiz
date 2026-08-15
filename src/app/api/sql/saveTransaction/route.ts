import { DELETED_KEYWORD, PROCESSING_KEYWORD, DEFAULT_USER, DEFAULT_VAT_RATE } from '@/app/utils/constants';
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
        INSERT INTO ${prefix}transactions (order_id, customer_name, user_name, payment_method, amount, currency, change, take_out, hash, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
    `
        : `
        INSERT INTO ${prefix}transactions (order_id, customer_name, user_name, payment_method, amount, currency, change, take_out, hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    // Update the transaction record to mark it as deleted (lookup by order_id)
    const updateQuery = isPg
        ? `UPDATE ${prefix}transactions SET payment_method = $1, updated_at = $2 WHERE order_id = $3`
        : `UPDATE ${prefix}transactions SET payment_method = ?, updated_at = ? WHERE order_id = ?`;

    await connection.execute(updateQuery, [DELETED_KEYWORD, transaction.updated_at, transaction.order_id]);
}

async function handleHardDeleteTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

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
            SET customer_name = $1, user_name = $2, payment_method = $3, amount = $4, currency = $5, change = $6, take_out = $7, hash = $8, updated_at = $9
            WHERE order_id = $10
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
            SET customer_name = ?, user_name = ?, payment_method = ?, amount = ?, currency = ?, change = ?, take_out = ?, hash = ?, updated_at = ?
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
