import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';
import { getBalanceAffectingEntries } from '../customerBalanceHelpers';

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

        // Balance and history are derived entirely from the transactions table so they always
        // reflect the current state (deletions/edits included), with no separate ledger to drift.
        const { balance, entries } = await getBalanceAffectingEntries(connection, customerName);

        // Most recent first, capped at 50 entries (matching the previous behaviour).
        const history = entries
            .map((entry) => ({
                amount: Math.abs(entry.amount),
                operation: entry.operation,
                previous_balance: entry.previousBalance,
                new_balance: entry.newBalance,
                created_at: entry.createdAt,
            }))
            .reverse()
            .slice(0, 50);

        await connection.end();

        return NextResponse.json({ balance, history }, { status: 200 });
    } catch (error) {
        console.error('Error getting customer balance:', error);
        return NextResponse.json({ error: 'An error occurred while getting customer balance' }, { status: 500 });
    }
}
