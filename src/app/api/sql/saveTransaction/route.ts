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
    payment_method_id: string;
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

        if (!action || !transaction) {
            return NextResponse.json({ error: 'Action and transaction data are required' }, { status: 400 });
        }

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

async function handleAddTransaction(connection: Connection, transaction: TransactionData) {
    // First, ensure the user exists in the users table
    const userId = await ensureUserExists(connection, transaction.user_id);

    // Ensure the payment method exists in the payment_methods table
    const paymentMethodId = await ensurePaymentMethodExists(
        connection,
        transaction.payment_method_id,
        transaction.currency
    );

    // Insert into facturation table
    const insertFacturationQuery = `
        INSERT INTO facturation (panier_id, user_id, payment_method_id, amount, currency, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await connection.execute(insertFacturationQuery, [
        transaction.panier_id,
        userId,
        paymentMethodId,
        transaction.amount,
        transaction.currency,
        transaction.note || '',
        transaction.created_at,
        transaction.updated_at,
    ]);

    // Get the inserted facturation ID
    const [rows] = await connection.execute('SELECT LAST_INSERT_ID() as id');
    const facturationId = (rows as IdRow[])[0].id;

    // Insert products into facturation_article table
    if (transaction.products && transaction.products.length > 0) {
        for (const product of transaction.products) {
            const insertArticleQuery = `
                INSERT INTO facturation_article (facturation_id, label, category, amount, quantity, discount_amount, discount_unit, total)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await connection.execute(insertArticleQuery, [
                facturationId,
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
    // Update the facturation record to mark it as processing
    const updateQuery = `
        UPDATE facturation
        SET payment_method_id = ?, updated_at = ?
        WHERE panier_id = ?
    `;

    // Get the payment method ID for PROCESSING_KEYWORD
    const paymentMethodId = await ensurePaymentMethodExists(connection, PROCESSING_KEYWORD, transaction.currency);

    await connection.execute(updateQuery, [paymentMethodId, transaction.updated_at, transaction.panier_id]);
}

async function handleDeleteTransaction(connection: Connection, transaction: TransactionData) {
    // Update the facturation record to mark it as deleted
    const updateQuery = `
        UPDATE facturation
        SET payment_method_id = ?, updated_at = ?
        WHERE panier_id = ?
    `;

    // Get the payment method ID for DELETED_KEYWORD
    const paymentMethodId = await ensurePaymentMethodExists(connection, DELETED_KEYWORD, transaction.currency);

    await connection.execute(updateQuery, [paymentMethodId, transaction.updated_at, transaction.panier_id]);
}

async function handleSyncTransaction(connection: Connection, transaction: TransactionData) {
    // Find existing facturation by created_at
    const [existing] = await connection.execute('SELECT id FROM facturation WHERE created_at = ?', [
        transaction.created_at,
    ]);
    const existingRows = existing as IdRow[];

    if (existingRows.length === 0) {
        // No existing row — do a full add
        await handleAddTransaction(connection, transaction);
        return;
    }

    const facturationId = existingRows[0].id;

    // Ensure user and payment method exist
    const userId = await ensureUserExists(connection, transaction.user_id);
    const paymentMethodId = await ensurePaymentMethodExists(
        connection,
        transaction.payment_method_id,
        transaction.currency
    );

    // Update the facturation row
    await connection.execute(
        `UPDATE facturation
         SET user_id = ?, payment_method_id = ?, amount = ?, currency = ?, note = ?, updated_at = ?
         WHERE id = ?`,
        [
            userId,
            paymentMethodId,
            transaction.amount,
            transaction.currency,
            transaction.note || '',
            transaction.updated_at,
            facturationId,
        ]
    );

    // Delete old articles and re-insert
    await connection.execute('DELETE FROM facturation_article WHERE facturation_id = ?', [facturationId]);

    if (transaction.products && transaction.products.length > 0) {
        for (const product of transaction.products) {
            await connection.execute(
                `INSERT INTO facturation_article (facturation_id, label, category, amount, quantity, discount_amount, discount_unit, total)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    facturationId,
                    product.label,
                    product.category,
                    product.amount,
                    product.quantity,
                    product.discount_amount || 0,
                    product.discount_unit || '',
                    product.total,
                ]
            );
        }
    }
}

async function ensureUserExists(connection: Connection, userName: string): Promise<string> {
    // If no userName provided, use DEFAULT_USER
    const actualUserName = userName || DEFAULT_USER;

    // Check if user exists
    const [rows] = await connection.execute('SELECT id FROM users WHERE name = ?', [actualUserName]);

    const userRows = rows as IdRow[];
    if (userRows.length > 0) return String(userRows[0].id);

    // User doesn't exist, create with default role 'Cashier'
    const insertUserQuery = `
        INSERT INTO users (\`key\`, name, role)
        VALUES (?, ?, 'Cashier')
    `;

    // Generate a key for the user
    const userKey = actualUserName.toLowerCase().replace(/\s+/g, '_');

    await connection.execute(insertUserQuery, [userKey, actualUserName]);

    // Get the inserted ID
    const [insertResult] = await connection.execute('SELECT LAST_INSERT_ID() as id');
    const insertedId = (insertResult as IdRow[])[0].id;

    return String(insertedId);
}

async function ensurePaymentMethodExists(
    connection: Connection,
    methodLabel: string,
    currency: string
): Promise<number> {
    // Check if payment method exists
    const [rows] = await connection.execute('SELECT id FROM payment_methods WHERE label = ?', [methodLabel]);

    const methodRows = rows as IdRow[];
    if (methodRows.length > 0) {
        return Number(methodRows[0].id);
    }

    // Payment method doesn't exist, create it
    const insertPaymentMethodQuery = `
        INSERT INTO payment_methods (label, address, currency, hidden, created_at)
        VALUES (?, 0, ?, 0, NOW())
    `;

    await connection.execute(insertPaymentMethodQuery, [methodLabel, currency]);

    // Get the inserted ID
    const [newRows] = await connection.execute('SELECT LAST_INSERT_ID() as id');
    return Number((newRows as IdRow[])[0].id);
}
