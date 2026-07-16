import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const { customerId, amount, operation } = (await request.json()) as {
            customerId: number;
            amount: number;
            operation: 'credit' | 'debit';
        };

        if (!customerId || (operation !== 'credit' && operation !== 'debit')) {
            return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 });
        }
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
            return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
        }

        const connection = await getPosDb(shopId);

        const delta = operation === 'credit' ? amount : -amount;

        // Atomically update the balance and return both the previous and new values.
        // Using SQL arithmetic (balance = balance + delta) avoids the read-modify-write
        // race condition where concurrent updates could overwrite each other.
        const customerTable = connection.isPostgreSQL ? 'dc_pos.customers' : 'customers';

        let previousBalance: number;
        let newBalance: number;

        if (connection.isPostgreSQL) {
            const [rows] = await connection.execute(
                `UPDATE ${customerTable}
                 SET balance = balance + $1
                 WHERE id = $2
                 RETURNING balance - $1 AS previous_balance, balance AS new_balance`,
                [delta, customerId]
            );
            const result = (rows as { previous_balance: number; new_balance: number }[])[0];
            if (!result) {
                await connection.end();
                return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
            }
            previousBalance = Number(result.previous_balance);
            newBalance = Number(result.new_balance);
        } else {
            // MariaDB/MySQL: no RETURNING, so update then read back within the same connection
            await connection.execute(`UPDATE ${customerTable} SET balance = balance + ? WHERE id = ?`, [
                delta,
                customerId,
            ]);
            const [rows] = await connection.execute(`SELECT balance FROM ${customerTable} WHERE id = ?`, [customerId]);
            const row = (rows as { balance: number }[])[0];
            if (!row) {
                await connection.end();
                return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
            }
            newBalance = Number(row.balance);
            previousBalance = newBalance - delta;
        }

        // Record balance change in transaction history
        const historyQuery = connection.isPostgreSQL
            ? `INSERT INTO dc_pos.balance_history (customer_id, amount, operation, previous_balance, new_balance, created_at)
               VALUES ($1, $2, $3, $4, $5, NOW())`
            : `INSERT INTO balance_history (customer_id, amount, operation, previous_balance, new_balance, created_at)
               VALUES (?, ?, ?, ?, ?, NOW())`;

        await connection.execute(historyQuery, [customerId, amount, operation, previousBalance, newBalance]);

        await connection.end();

        return NextResponse.json({ success: true, newBalance }, { status: 200 });
    } catch (error) {
        console.error('Error updating customer balance:', error);
        return NextResponse.json({ error: 'An error occurred while updating customer balance' }, { status: 500 });
    }
}
