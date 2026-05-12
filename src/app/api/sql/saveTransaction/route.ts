import { DELETED_KEYWORD, PROCESSING_KEYWORD, DEFAULT_USER } from '@/app/utils/constants';
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
}

interface TransactionData {
    panier_id: string;
    user_id: string;
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
    try {
        const body = await request.json();
        const { action, transaction } = body;

        if (!action || !transaction)
            return NextResponse.json({ error: 'Action and transaction data are required' }, { status: 400 });

        const connection = await getPosDb();

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

function generateTransactionHash(transaction: TransactionData, transactionId?: string | number): string {
    // Generate a hash from transaction data for integrity verification
    const data = [
        transactionId || 'new',
        transaction.panier_id,
        transaction.user_id,
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
    return Math.abs(hash).toString(16).padStart(16, '0') + Date.now().toString(16);
}

async function handleAddTransaction(connection: Connection, transaction: TransactionData) {
    // Check if transaction already exists (by created_at timestamp to avoid duplicates)
    const checkQuery = connection.isPostgreSQL
        ? 'SELECT id FROM transactions WHERE created_at = $1'
        : 'SELECT id FROM transactions WHERE created_at = ?';
    const [existing] = await connection.execute(checkQuery, [transaction.created_at]);
    const existingRows = existing as IdRow[];

    if (existingRows.length > 0) {
        // Transaction already exists, skip insert
        return;
    }

    // First, ensure the user exists in the users table
    const userId = await ensureUserExists(connection, transaction.user_id);

    // Generate hash for the transaction
    const hash = generateTransactionHash(transaction);

    // Insert into transactions table (payment_method and currency are now strings)
    const insertTransactionQuery = connection.isPostgreSQL
        ? `
        INSERT INTO transactions (panier_id, user_id, payment_method, amount, currency, note, hash, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
    `
        : `
        INSERT INTO transactions (panier_id, user_id, payment_method, amount, currency, note, hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
        transaction.panier_id,
        userId,
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
                INSERT INTO transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `
                : `
                INSERT INTO transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
            ]);
        }
    }
}

async function handleUpdateTransaction(connection: Connection, transaction: TransactionData) {
    // Update the transaction record to mark it as processing
    const updateQuery = connection.isPostgreSQL
        ? `
        UPDATE transactions
        SET payment_method = $1, updated_at = $2
        WHERE panier_id = $3
    `
        : `
        UPDATE transactions
        SET payment_method = ?, updated_at = ?
        WHERE panier_id = ?
    `;

    await connection.execute(updateQuery, [PROCESSING_KEYWORD, transaction.updated_at, transaction.panier_id]);
}

async function handleDeleteTransaction(connection: Connection, transaction: TransactionData) {
    // Update the transaction record to mark it as deleted
    const updateQuery = connection.isPostgreSQL
        ? `
        UPDATE transactions
        SET payment_method = $1, updated_at = $2
        WHERE panier_id = $3
    `
        : `
        UPDATE transactions
        SET payment_method = ?, updated_at = ?
        WHERE panier_id = ?
    `;

    await connection.execute(updateQuery, [DELETED_KEYWORD, transaction.updated_at, transaction.panier_id]);
}

async function handleSyncTransaction(connection: Connection, transaction: TransactionData) {
    // Find existing transaction by created_at
    const checkQuery = connection.isPostgreSQL
        ? 'SELECT id FROM transactions WHERE created_at = $1'
        : 'SELECT id FROM transactions WHERE created_at = ?';
    const [existing] = await connection.execute(checkQuery, [transaction.created_at]);
    const existingRows = existing as IdRow[];

    if (existingRows.length === 0) {
        // No existing row — do a full add
        await handleAddTransaction(connection, transaction);
        return;
    }

    const transactionId = existingRows[0].id;

    // Ensure user exists
    const userId = await ensureUserExists(connection, transaction.user_id);

    // Generate new hash for updated transaction
    const hash = generateTransactionHash(transaction, transactionId);

    // Update the transaction row (payment_method and currency are strings)
    const updateQuery = connection.isPostgreSQL
        ? `
        UPDATE transactions
         SET user_id = $1, payment_method = $2, amount = $3, currency = $4, note = $5, hash = $6, updated_at = $7
         WHERE id = $8
    `
        : `
        UPDATE transactions
         SET user_id = ?, payment_method = ?, amount = ?, currency = ?, note = ?, hash = ?, updated_at = ?
         WHERE id = ?
    `;
    await connection.execute(updateQuery, [
        userId,
        transaction.payment_method,
        transaction.amount,
        transaction.currency,
        transaction.note || '',
        hash,
        transaction.updated_at,
        transactionId,
    ]);

    // Delete old items and re-insert
    const deleteQuery = connection.isPostgreSQL
        ? 'DELETE FROM transaction_items WHERE transaction_id = $1'
        : 'DELETE FROM transaction_items WHERE transaction_id = ?';
    await connection.execute(deleteQuery, [transactionId]);

    if (transaction.products && transaction.products.length > 0) {
        for (const product of transaction.products) {
            const insertQuery = connection.isPostgreSQL
                ? `
                INSERT INTO transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `
                : `
                INSERT INTO transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
            ]);
        }
    }
}

async function ensureUserExists(connection: Connection, userName: string): Promise<string> {
    // If no userName provided, use DEFAULT_USER
    const actualUserName = userName || DEFAULT_USER;

    // Check if user exists
    const checkQuery = connection.isPostgreSQL
        ? 'SELECT id FROM users WHERE name = $1'
        : 'SELECT id FROM users WHERE name = ?';
    const [rows] = await connection.execute(checkQuery, [actualUserName]);

    const userRows = rows as IdRow[];
    if (userRows.length > 0) return String(userRows[0].id);

    // User doesn't exist, create with default role 'Cashier'
    const insertUserQuery = connection.isPostgreSQL
        ? `
        INSERT INTO users ("key", name, role)
        VALUES ($1, $2, 'Cashier')
        RETURNING id
    `
        : `
        INSERT INTO users (\`key\`, name, role)
        VALUES (?, ?, 'Cashier')
    `;

    // Generate a key for the user
    const userKey = actualUserName.toLowerCase().replace(/\s+/g, '_');

    let insertedId: number | string;
    if (connection.isPostgreSQL) {
        const [insertResult] = await connection.execute(insertUserQuery, [userKey, actualUserName]);
        insertedId = (insertResult as IdRow[])[0].id;
    } else {
        await connection.execute(insertUserQuery, [userKey, actualUserName]);
        const [insertResult] = await connection.execute('SELECT LAST_INSERT_ID() as id');
        insertedId = (insertResult as IdRow[])[0].id;
    }

    return String(insertedId);
}
