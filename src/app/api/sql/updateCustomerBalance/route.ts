import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export async function POST(request: Request) {
    try {
        const { customerId, amount, operation } = (await request.json()) as {
            customerId: number;
            amount: number;
            operation: 'credit' | 'debit';
        };

        if (!customerId || !amount || !operation) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const connection = await getPosDb();

        // Get current balance
        const getQuery = connection.isPostgreSQL
            ? 'SELECT balance FROM dc_pos.customers WHERE id = $1'
            : 'SELECT balance FROM customers WHERE id = ?';

        const [rows] = await connection.execute(getQuery, [customerId]);
        const currentBalance = (rows as { balance: number }[])[0]?.balance || 0;

        // Calculate new balance
        const newBalance = operation === 'credit' ? currentBalance + amount : currentBalance - amount;

        // Update balance
        const updateQuery = connection.isPostgreSQL
            ? 'UPDATE dc_pos.customers SET balance = $1 WHERE id = $2'
            : 'UPDATE customers SET balance = ? WHERE id = ?';

        await connection.execute(updateQuery, [newBalance, customerId]);

        // Record balance change in transaction history
        const historyQuery = connection.isPostgreSQL
            ? `INSERT INTO dc_pos.balance_history (customer_id, amount, operation, previous_balance, new_balance, created_at)
               VALUES ($1, $2, $3, $4, $5, NOW())`
            : `INSERT INTO balance_history (customer_id, amount, operation, previous_balance, new_balance, created_at)
               VALUES (?, ?, ?, ?, ?, NOW())`;

        await connection.execute(historyQuery, [customerId, amount, operation, currentBalance, newBalance]);

        await connection.end();

        return NextResponse.json({ success: true, newBalance }, { status: 200 });
    } catch (error) {
        console.error('Error updating customer balance:', error);
        return NextResponse.json({ error: 'An error occurred while updating customer balance' }, { status: 500 });
    }
}
