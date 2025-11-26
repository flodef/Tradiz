import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';
import { DELETED_KEYWORD, PROCESSING_KEYWORD } from '@/app/utils/constants';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, transaction } = body;

        if (!action || !transaction) {
            return NextResponse.json({ error: 'Action and transaction data are required' }, { status: 400 });
        }

        // Connection configuration for SQL DB
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

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

async function handleAddTransaction(connection: mysql.Connection, transaction: any) {
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
    const facturationId = (rows as any)[0].id;

    // Insert products into facturation_article table
    if (transaction.products && transaction.products.length > 0) {
        for (const product of transaction.products) {
            const insertArticleQuery = `
                INSERT INTO facturation_article (facturation_id, article_id, label, category, amount, quantity, discount_amount, discount_unit, total)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await connection.execute(insertArticleQuery, [
                facturationId,
                product.article_id,
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

async function handleUpdateTransaction(connection: mysql.Connection, transaction: any) {
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

async function handleDeleteTransaction(connection: mysql.Connection, transaction: any) {
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

async function ensureUserExists(connection: mysql.Connection, userName: string): Promise<string> {
    // Check if user exists
    const [rows] = await connection.execute('SELECT id FROM users WHERE name = ?', [userName]);

    if ((rows as any[]).length > 0) {
        return (rows as any)[0].id;
    }

    // User doesn't exist, create with default role 'Cashier'
    const insertUserQuery = `
        INSERT INTO users (id, name, role, created_at)
        VALUES (?, ?, 'Cashier', NOW())
    `;

    // Generate a simple ID for the user (you might want to use a better ID generation strategy)
    const userId = userName.toLowerCase().replace(/\s+/g, '_');

    await connection.execute(insertUserQuery, [userId, userName]);

    return userId;
}

async function ensurePaymentMethodExists(
    connection: mysql.Connection,
    methodLabel: string,
    currency: string
): Promise<number> {
    // Check if payment method exists
    const [rows] = await connection.execute('SELECT id FROM payment_methods WHERE label = ?', [methodLabel]);

    if ((rows as any[]).length > 0) {
        return (rows as any)[0].id;
    }

    // Payment method doesn't exist, create it
    const insertPaymentMethodQuery = `
        INSERT INTO payment_methods (label, address, currency, hidden, created_at)
        VALUES (?, 0, ?, 0, NOW())
    `;

    await connection.execute(insertPaymentMethodQuery, [methodLabel, currency]);

    // Get the inserted ID
    const [newRows] = await connection.execute('SELECT LAST_INSERT_ID() as id');
    return (newRows as any)[0].id;
}
