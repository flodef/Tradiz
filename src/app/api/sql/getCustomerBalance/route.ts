import { getShopIdFromRequest } from '@/app/constants/shop';
import { DEBIT_KEYWORD, DELETED_KEYWORD } from '@/app/utils/constants';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const { searchParams } = new URL(request.url);
        const customerId = searchParams.get('customerId');

        if (!customerId) {
            return NextResponse.json({ error: 'Missing customerId parameter' }, { status: 400 });
        }

        const connection = await getPosDb(shopId);
        const isPg = connection.isPostgreSQL;

        // Resolve the customer's full name from the customers table.
        const customerNameQuery = isPg
            ? "SELECT first_name || ' ' || last_name AS full_name FROM dc_pos.customers WHERE id = $1"
            : "SELECT CONCAT(first_name, ' ', last_name) AS full_name FROM customers WHERE id = ?";

        const [customerNameRows] = await connection.execute(customerNameQuery, [customerId]);
        const customerName = (customerNameRows as { full_name: string }[])[0]?.full_name;

        // Compute balance from the transactions table: provisions (no products) minus debits.
        let balance = 0;
        if (customerName) {
            const balanceQuery = isPg
                ? `
                SELECT
                    COALESCE(SUM(CASE WHEN agg.payment_method != $2 AND NOT has_items THEN agg.amount ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN agg.payment_method = $2 THEN agg.amount ELSE 0 END), 0) AS balance
                FROM (
                    SELECT t.amount, t.payment_method, EXISTS (
                        SELECT 1 FROM dc_pos.transaction_items ti WHERE ti.transaction_id = t.id
                    ) AS has_items
                    FROM dc_pos.transactions t
                    WHERE t.customer_name = $1 AND t.payment_method != $3
                ) agg
            `
                : `
                SELECT
                    COALESCE(SUM(CASE WHEN agg.payment_method != ? AND NOT has_items THEN agg.amount ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN agg.payment_method = ? THEN agg.amount ELSE 0 END), 0) AS balance
                FROM (
                    SELECT t.amount, t.payment_method, EXISTS (
                        SELECT 1 FROM transaction_items ti WHERE ti.transaction_id = t.id
                    ) AS has_items
                    FROM transactions t
                    WHERE t.customer_name = ? AND t.payment_method != ?
                ) agg
            `;

            const [balanceRows] = await connection.execute(
                balanceQuery,
                isPg
                    ? [customerName, DEBIT_KEYWORD, DELETED_KEYWORD]
                    : [DEBIT_KEYWORD, DEBIT_KEYWORD, customerName, DELETED_KEYWORD]
            );
            balance = Number((balanceRows as { balance: number | string }[])[0]?.balance ?? 0);
        }

        // Get balance history (last 50 entries)
        const historyQuery = connection.isPostgreSQL
            ? `SELECT amount, operation, previous_balance, new_balance, created_at 
               FROM dc_pos.balance_history 
               WHERE customer_id = $1 
               ORDER BY created_at DESC 
               LIMIT 50`
            : `SELECT amount, operation, previous_balance, new_balance, created_at 
               FROM balance_history 
               WHERE customer_id = ? 
               ORDER BY created_at DESC 
               LIMIT 50`;

        const [historyRows] = await connection.execute(historyQuery, [customerId]);
        const history = (
            historyRows as Array<{
                amount: number;
                operation: 'credit' | 'debit' | 'deleted';
                previous_balance: number;
                new_balance: number;
                created_at: string;
            }>
        ).map((entry) => ({
            amount: Number(entry.amount),
            operation: entry.operation,
            previous_balance: Number(entry.previous_balance),
            new_balance: Number(entry.new_balance),
            created_at: entry.created_at,
        }));

        await connection.end();

        return NextResponse.json({ balance, history }, { status: 200 });
    } catch (error) {
        console.error('Error getting customer balance:', error);
        return NextResponse.json({ error: 'An error occurred while getting customer balance' }, { status: 500 });
    }
}
