import {
    DEBIT_KEYWORD,
    DELETED_KEYWORD,
    PROCESSING_KEYWORD,
    DEFAULT_USER,
    DEFAULT_VAT_RATE,
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
    note?: string;
    created_at: string;
    updated_at: string;
    products?: TransactionProduct[];
}

interface IdRow {
    id: number | string;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const body = await request.json();
        const { action, transaction } = body;

        if (!action || !transaction)
            return NextResponse.json({ error: 'Action and transaction data are required' }, { status: 400 });

        const connection = await getPosDb(shopId);

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
            await connection.end();
            throw error;
        }
    } catch (error) {
        console.error('Database transaction error:', error);
        return NextResponse.json(
            { error: 'An error occurred while saving transaction', details: String(error) },
            { status: 500 }
        );
    }
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
        transaction.note || '',
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

// --- balance history helpers ---

function affectsBalance(paymentMethod: string, productCount: number): boolean {
    if (paymentMethod === DELETED_KEYWORD || paymentMethod === PROCESSING_KEYWORD) return false;
    if (paymentMethod === DEBIT_KEYWORD) return true;
    return productCount === 0;
}

function getBalanceOperation(paymentMethod: string): 'credit' | 'debit' {
    return paymentMethod === DEBIT_KEYWORD ? 'debit' : 'credit';
}

function getBalanceDelta(paymentMethod: string, amount: number): number {
    return paymentMethod === DEBIT_KEYWORD ? -amount : amount;
}

async function findCustomerIdByName(
    connection: Connection,
    customerName?: string | null
): Promise<number | string | null> {
    if (!customerName) return null;
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = isPg
        ? `SELECT id FROM ${prefix}customers WHERE TRIM(first_name || ' ' || last_name) = TRIM($1)`
        : `SELECT id FROM ${prefix}customers WHERE TRIM(CONCAT(first_name, ' ', last_name)) = TRIM(?)`;
    const [rows] = await connection.execute(query, [customerName]);
    const customers = rows as { id: number | string }[];
    return customers.length > 0 ? customers[0].id : null;
}

async function getCustomerBalanceById(connection: Connection, customerId: number | string): Promise<number> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = isPg
        ? `SELECT balance FROM ${prefix}customers WHERE id = $1`
        : `SELECT balance FROM ${prefix}customers WHERE id = ?`;
    const [rows] = await connection.execute(query, [customerId]);
    return Number((rows as { balance: number | string }[])[0]?.balance ?? 0);
}

async function markBalanceHistoryDeleted(
    connection: Connection,
    customerId: number | string,
    operation: 'credit' | 'debit',
    amount: number,
    createdAt: string
) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = isPg
        ? `
        UPDATE ${prefix}balance_history bh
        SET operation = 'deleted'
        FROM (
            SELECT id
            FROM ${prefix}balance_history
            WHERE customer_id = $1::int AND amount = $2 AND operation = $3
              AND ABS(EXTRACT(EPOCH FROM created_at) - EXTRACT(EPOCH FROM $4::timestamp)) < 60
            ORDER BY ABS(EXTRACT(EPOCH FROM created_at) - EXTRACT(EPOCH FROM $4::timestamp))
            LIMIT 1
        ) matched
        WHERE bh.id = matched.id
    `
        : `
        UPDATE ${prefix}balance_history bh
        INNER JOIN (
            SELECT id
            FROM balance_history
            WHERE customer_id = ? AND amount = ? AND operation = ?
              AND ABS(TIMESTAMPDIFF(SECOND, created_at, ?)) < 60
            ORDER BY ABS(TIMESTAMPDIFF(SECOND, created_at, ?))
            LIMIT 1
        ) matched ON bh.id = matched.id
        SET bh.operation = 'deleted'
    `;
    const params = isPg
        ? [customerId, amount, operation, createdAt]
        : [customerId, amount, operation, createdAt, createdAt];
    await connection.execute(query, params);
}

async function updateCustomerBalanceById(connection: Connection, customerId: number | string, delta: number) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = isPg
        ? `UPDATE ${prefix}customers SET balance = balance + $1 WHERE id = $2`
        : `UPDATE ${prefix}customers SET balance = balance + ? WHERE id = ?`;
    await connection.execute(query, [delta, customerId]);
}

async function insertBalanceHistory(
    connection: Connection,
    customerId: number | string,
    amount: number,
    operation: 'credit' | 'debit',
    previousBalance: number,
    newBalance: number,
    createdAt: string
) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = isPg
        ? `INSERT INTO ${prefix}balance_history (customer_id, amount, operation, previous_balance, new_balance, created_at) VALUES ($1, $2, $3, $4, $5, $6)`
        : `INSERT INTO ${prefix}balance_history (customer_id, amount, operation, previous_balance, new_balance, created_at) VALUES (?, ?, ?, ?, ?, ?)`;
    await connection.execute(query, [customerId, amount, operation, previousBalance, newBalance, createdAt]);
}

async function addBalanceEffect(connection: Connection, transaction: TransactionData) {
    if (!transaction.customer_name) return;
    const productCount = transaction.products?.length ?? 0;
    if (!affectsBalance(transaction.payment_method, productCount)) return;

    const customerId = await findCustomerIdByName(connection, transaction.customer_name);
    if (customerId === null) return;

    const operation = getBalanceOperation(transaction.payment_method);
    const delta = getBalanceDelta(transaction.payment_method, transaction.amount);
    const previousBalance = await getCustomerBalanceById(connection, customerId);
    const newBalance = previousBalance + delta;

    await updateCustomerBalanceById(connection, customerId, delta);
    await insertBalanceHistory(
        connection,
        customerId,
        transaction.amount,
        operation,
        previousBalance,
        newBalance,
        transaction.created_at
    );
}

async function revertBalanceEffect(
    connection: Connection,
    transaction: { payment_method: string; amount: number; customer_name?: string | null; created_at: string },
    productCount: number
) {
    if (!affectsBalance(transaction.payment_method, productCount)) return;

    const customerId = await findCustomerIdByName(connection, transaction.customer_name);
    if (customerId === null) return;

    const operation = getBalanceOperation(transaction.payment_method);
    const delta = getBalanceDelta(transaction.payment_method, transaction.amount);

    await markBalanceHistoryDeleted(connection, customerId, operation, transaction.amount, transaction.created_at);
    await updateCustomerBalanceById(connection, customerId, -delta);
}

async function handleAddTransaction(connection: Connection, transaction: TransactionData) {
    // Check if transaction already exists (by created_at timestamp to avoid duplicates)
    const checkQuery = connection.isPostgreSQL
        ? 'SELECT id FROM dc_pos.transactions WHERE created_at = $1'
        : 'SELECT id FROM transactions WHERE created_at = ?';
    const [existing] = await connection.execute(checkQuery, [transaction.created_at]);
    const existingRows = existing as IdRow[];

    if (existingRows.length > 0) {
        // Transaction already exists — sync it instead of skipping
        await handleSyncTransaction(connection, transaction);
        return;
    }

    // Use provided user name or default
    const userName = transaction.user_name || DEFAULT_USER;

    // Generate hash for the transaction
    const hash = generateTransactionHash(transaction);

    // Insert into transactions table (payment_method, currency, and user_name are strings)
    const insertTransactionQuery = connection.isPostgreSQL
        ? `
        INSERT INTO dc_pos.transactions (order_id, customer_name, user_name, payment_method, amount, currency, note, hash, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
    `
        : `
        INSERT INTO transactions (order_id, customer_name, user_name, payment_method, amount, currency, note, hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
        transaction.order_id,
        transaction.customer_name ?? null,
        userName,
        transaction.payment_method,
        transaction.amount,
        transaction.currency,
        transaction.note || '',
        hash,
        transaction.created_at,
        transaction.updated_at,
    ];

    let transactionId: number | string;
    if (connection.isPostgreSQL) {
        const [rows] = await connection.execute(insertTransactionQuery, params);
        transactionId = (rows as IdRow[])[0].id;
    } else {
        await connection.execute(insertTransactionQuery, params);
        const [rows] = await connection.execute('SELECT LAST_INSERT_ID() as id');
        transactionId = (rows as IdRow[])[0].id;
    }

    // Insert products into transaction_items table
    if (transaction.products && transaction.products.length > 0) {
        for (const product of transaction.products) {
            const insertItemQuery = connection.isPostgreSQL
                ? `
                INSERT INTO transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total, vat_rate)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `
                : `
                INSERT INTO transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total, vat_rate)
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

    // Record balance impact for new debit/provision transactions.
    await addBalanceEffect(connection, transaction);
}

async function handleUpdateTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Fetch the existing transaction state before switching it to PROCESSING.
    const [oldTxRows] = await connection.execute(
        isPg
            ? `SELECT payment_method, amount, customer_name, created_at FROM ${prefix}transactions WHERE created_at = $1`
            : `SELECT payment_method, amount, customer_name, created_at FROM ${prefix}transactions WHERE created_at = ?`,
        [transaction.created_at]
    );
    const oldTx = (
        oldTxRows as { payment_method: string; amount: number; customer_name: string; created_at: string }[]
    )[0];

    if (oldTx) {
        const [oldItemRows] = await connection.execute(
            isPg
                ? `SELECT COUNT(*) as count FROM ${prefix}transaction_items WHERE transaction_id = (SELECT id FROM ${prefix}transactions WHERE created_at = $1)`
                : `SELECT COUNT(*) as count FROM ${prefix}transaction_items WHERE transaction_id = (SELECT id FROM ${prefix}transactions WHERE created_at = ?)`,
            [transaction.created_at]
        );
        const oldItemCount = Number((oldItemRows as { count: number | string }[])[0]?.count ?? 0);
        await revertBalanceEffect(connection, oldTx, oldItemCount);
    }

    // Update the transaction record to mark it as processing (lookup by created_at for reliability)
    const updateQuery = isPg
        ? `UPDATE ${prefix}transactions SET payment_method = $1, updated_at = $2 WHERE created_at = $3`
        : `UPDATE ${prefix}transactions SET payment_method = ?, updated_at = ? WHERE created_at = ?`;

    await connection.execute(updateQuery, [PROCESSING_KEYWORD, transaction.updated_at, transaction.created_at]);
}

async function handleDeleteTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Fetch the existing transaction state before marking it as deleted.
    const [oldTxRows] = await connection.execute(
        isPg
            ? `SELECT payment_method, amount, customer_name, created_at FROM ${prefix}transactions WHERE created_at = $1`
            : `SELECT payment_method, amount, customer_name, created_at FROM ${prefix}transactions WHERE created_at = ?`,
        [transaction.created_at]
    );
    const oldTx = (
        oldTxRows as { payment_method: string; amount: number; customer_name: string; created_at: string }[]
    )[0];

    // Update the transaction record to mark it as deleted (lookup by created_at for reliability)
    const updateQuery = isPg
        ? `UPDATE ${prefix}transactions SET payment_method = $1, updated_at = $2 WHERE created_at = $3`
        : `UPDATE ${prefix}transactions SET payment_method = ?, updated_at = ? WHERE created_at = ?`;

    await connection.execute(updateQuery, [DELETED_KEYWORD, transaction.updated_at, transaction.created_at]);

    if (oldTx) {
        const [oldItemRows] = await connection.execute(
            isPg
                ? `SELECT COUNT(*) as count FROM ${prefix}transaction_items WHERE transaction_id = (SELECT id FROM ${prefix}transactions WHERE created_at = $1)`
                : `SELECT COUNT(*) as count FROM ${prefix}transaction_items WHERE transaction_id = (SELECT id FROM ${prefix}transactions WHERE created_at = ?)`,
            [transaction.created_at]
        );
        const oldItemCount = Number((oldItemRows as { count: number | string }[])[0]?.count ?? 0);
        await revertBalanceEffect(connection, oldTx, oldItemCount);
    }
}

async function handleSyncTransaction(connection: Connection, transaction: TransactionData) {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    // Find existing transaction by created_at
    const checkQuery = isPg
        ? `SELECT id FROM ${prefix}transactions WHERE created_at = $1`
        : `SELECT id FROM ${prefix}transactions WHERE created_at = ?`;
    const [existing] = await connection.execute(checkQuery, [transaction.created_at]);
    const existingRows = existing as IdRow[];

    if (existingRows.length === 0) {
        // No existing row — do a full add
        await handleAddTransaction(connection, transaction);
        return;
    }

    const transactionId = existingRows[0].id;

    // Fetch the existing transaction state before updating.
    const [oldTxRows] = await connection.execute(
        isPg
            ? `SELECT payment_method, amount, customer_name, created_at FROM ${prefix}transactions WHERE id = $1`
            : `SELECT payment_method, amount, customer_name, created_at FROM ${prefix}transactions WHERE id = ?`,
        [transactionId]
    );
    const oldTx = (
        oldTxRows as { payment_method: string; amount: number; customer_name: string; created_at: string }[]
    )[0];

    const [oldItemRows] = await connection.execute(
        isPg
            ? `SELECT COUNT(*) as count FROM ${prefix}transaction_items WHERE transaction_id = $1`
            : `SELECT COUNT(*) as count FROM ${prefix}transaction_items WHERE transaction_id = ?`,
        [transactionId]
    );
    const oldItemCount = Number((oldItemRows as { count: number | string }[])[0]?.count ?? 0);

    // Use provided user name or default
    const userName = transaction.user_name || DEFAULT_USER;

    // Generate new hash for updated transaction
    const hash = generateTransactionHash(transaction, transactionId);

    // Update the transaction row (payment_method, currency, and user_name are strings)
    const updateQuery = isPg
        ? `
        UPDATE ${prefix}transactions
         SET customer_name = $1, user_name = $2, payment_method = $3, amount = $4, currency = $5, note = $6, hash = $7, updated_at = $8
         WHERE id = $9
    `
        : `
        UPDATE ${prefix}transactions
         SET customer_name = ?, user_name = ?, payment_method = ?, amount = ?, currency = ?, note = ?, hash = ?, updated_at = ?
         WHERE id = ?
    `;
    await connection.execute(updateQuery, [
        transaction.customer_name ?? null,
        userName,
        transaction.payment_method,
        transaction.amount,
        transaction.currency,
        transaction.note || '',
        hash,
        transaction.updated_at,
        transactionId,
    ]);

    // Delete old items and re-insert
    const deleteQuery = isPg
        ? `DELETE FROM ${prefix}transaction_items WHERE transaction_id = $1`
        : `DELETE FROM ${prefix}transaction_items WHERE transaction_id = ?`;
    await connection.execute(deleteQuery, [transactionId]);

    if (transaction.products && transaction.products.length > 0) {
        for (const product of transaction.products) {
            const insertQuery = isPg
                ? `
                INSERT INTO ${prefix}transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total, vat_rate)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `
                : `
                INSERT INTO ${prefix}transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total, vat_rate)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await connection.execute(insertQuery, [
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

    // Reconcile balance history: remove old effect then add new effect.
    const newProductCount = transaction.products?.length ?? 0;
    const oldAffects = oldTx ? affectsBalance(oldTx.payment_method, oldItemCount) : false;
    const newAffects = affectsBalance(transaction.payment_method, newProductCount);

    const sameEffect =
        oldAffects &&
        newAffects &&
        oldTx.payment_method === transaction.payment_method &&
        Number(oldTx.amount) === Number(transaction.amount) &&
        oldTx.customer_name === transaction.customer_name;

    if (!sameEffect) {
        if (oldAffects && oldTx) {
            await revertBalanceEffect(connection, oldTx, oldItemCount);
        }
        if (newAffects) {
            await addBalanceEffect(connection, transaction);
        }
    }
}
