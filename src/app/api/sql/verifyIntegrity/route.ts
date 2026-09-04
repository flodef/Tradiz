import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

interface TransactionRow {
    id: number;
    order_id: string;
    user_name: string;
    payment_method: string;
    amount: number;
    currency: string;
    created_at: string;
    change: string | null;
    device_id: string | null;
    hash: string | null;
    previous_hash: string | null;
}

interface IntegrityIssue {
    transaction_id: number;
    order_id: string;
    issue: string;
    stored_hash: string | null;
    computed_hash: string;
}

function recomputeHash(transactionId: number | string, tx: TransactionRow, previousHash: string | null): string {
    const data = [
        previousHash || '',
        transactionId || 'new',
        tx.order_id,
        tx.user_name,
        tx.payment_method,
        tx.amount,
        tx.currency,
        tx.created_at,
        tx.change || '',
        tx.device_id || '',
    ].join('|');
    return createHash('sha256').update(data).digest('hex');
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);
        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';

        // Fetch all transactions ordered by id (chain order)
        const query = `SELECT id, order_id, user_name, payment_method, amount, currency, created_at, change, device_id, hash, previous_hash FROM ${prefix}transactions ORDER BY id ASC`;
        const [rows] = await connection.execute(query);
        const transactions = rows as TransactionRow[];

        const issues: IntegrityIssue[] = [];
        let expectedPreviousHash: string | null = null;
        let verifiedCount = 0;

        for (const tx of transactions) {
            // Check previous_hash chain integrity
            if (tx.previous_hash !== expectedPreviousHash) {
                issues.push({
                    transaction_id: tx.id,
                    order_id: tx.order_id,
                    issue: `Chain break: stored previous_hash="${tx.previous_hash}" but expected="${expectedPreviousHash}"`,
                    stored_hash: tx.hash,
                    computed_hash: '',
                });
            }

            // Recompute hash and compare
            const computedHash = recomputeHash(tx.id, tx, tx.previous_hash);
            if (tx.hash !== computedHash) {
                issues.push({
                    transaction_id: tx.id,
                    order_id: tx.order_id,
                    issue: `Hash mismatch: stored="${tx.hash}" but computed="${computedHash}"`,
                    stored_hash: tx.hash,
                    computed_hash: computedHash,
                });
            } else {
                verifiedCount++;
            }

            // Move chain forward
            expectedPreviousHash = tx.hash;
        }

        return NextResponse.json(
            {
                total_transactions: transactions.length,
                verified: verifiedCount,
                issues_found: issues.length,
                issues: issues.length > 0 ? issues : undefined,
                integrity_ok: issues.length === 0,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Error verifying integrity:', error);
        return NextResponse.json({ error: 'An error occurred while verifying integrity' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
