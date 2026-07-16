import { getShopIdFromRequest } from '@/app/constants/shop';
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

        // Get current balance
        const getQuery = connection.isPostgreSQL
            ? 'SELECT balance FROM dc_pos.customers WHERE id = $1'
            : 'SELECT balance FROM customers WHERE id = ?';

        const [rows] = await connection.execute(getQuery, [customerId]);
        const balance = (rows as { balance: number }[])[0]?.balance || 0;

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
        const history = historyRows as Array<{
            amount: number;
            operation: 'credit' | 'debit';
            previous_balance: number;
            new_balance: number;
            created_at: string;
        }>;

        await connection.end();

        return NextResponse.json({ balance, history }, { status: 200 });
    } catch (error) {
        console.error('Error getting customer balance:', error);
        return NextResponse.json({ error: 'An error occurred while getting customer balance' }, { status: 500 });
    }
}
