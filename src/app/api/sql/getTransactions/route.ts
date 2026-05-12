import { isDeletedTransaction } from '@/app/contexts/dataProvider/transactionHelpers';
import { DEFAULT_USER } from '@/app/utils/constants';
import { Transaction } from '@/app/utils/interfaces';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface TransactionRow {
    id: number;
    panier_id: string;
    short_num_order: string | null;
    validator: string;
    method: string;
    amount: number;
    currency: string;
    note: string;
    createdDate: number;
    modifiedDate: number;
}

interface ProductRow {
    label: string;
    category: string;
    amount: number;
    quantity: number;
    discount_amount: number;
    discount_unit: string;
    total: number;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // Format: YYYY-MM-DD
    const period = searchParams.get('period'); // 'day' or 'full'
    const includeDeleted = searchParams.get('includeDeleted') === 'true';

    try {
        const connection = await getPosDb();

        let whereClause = '1=1';
        const params: (string | number)[] = [DEFAULT_USER];

        // Filter by date if provided
        if (date && period === 'day') {
            if (connection.isPostgreSQL) {
                whereClause += ' AND DATE(f.created_at) = $2';
            } else {
                whereClause += ' AND DATE(f.created_at) = ?';
            }
            params.push(date);
        }

        // Query to get transactions with their products
        // Note: created_at / updated_at are stored as UTC strings (via toSQLDateTime → .toISOString()).
        // UNIX_TIMESTAMP() interprets them as server-local time, so we compensate with
        // TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) which equals the server UTC offset
        // (e.g. +3600 for Europe/Paris in winter). This prevents a 1-hour gap that would cause
        // mergeTransactionArrays to treat the same transaction as two distinct entries.
        const mainDb = 'DC';
        const query = connection.isPostgreSQL
            ? `
            SELECT 
                t.id,
                t.panier_id,
                o.short_num_order,
                COALESCE(u.name, $1) as validator,
                t.payment_method as method,
                t.amount,
                t.currency,
                t.note,
                (EXTRACT(EPOCH FROM t.created_at) * 1000) as createdDate,
                (EXTRACT(EPOCH FROM t.updated_at) * 1000) as modifiedDate
            FROM transactions t
            LEFT JOIN users u ON u.id = t.user_id
            LEFT JOIN ${mainDb}.orders o ON o.id = t.panier_id
            WHERE ${whereClause}
            ORDER BY t.created_at DESC
        `
            : `
            SELECT 
                t.id,
                t.panier_id,
                o.short_num_order,
                COALESCE(u.name, ?) as validator,
                t.payment_method as method,
                t.amount,
                t.currency,
                t.note,
                (UNIX_TIMESTAMP(t.created_at) + TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())) * 1000 as createdDate,
                (UNIX_TIMESTAMP(t.updated_at) + TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())) * 1000 as modifiedDate
            FROM transactions t
            LEFT JOIN users u ON u.id = t.user_id
            LEFT JOIN \`${mainDb}\`.orders o ON o.id = t.panier_id
            WHERE ${whereClause}
            ORDER BY t.created_at DESC
        `;

        const [rows] = await connection.execute(query, params);

        // Get products for each transaction
        const transactions: Transaction[] = [];

        for (const row of rows as TransactionRow[]) {
            // Skip deleted transactions unless explicitly included (for sync)
            if (!includeDeleted && isDeletedTransaction({ method: row.method } as Transaction)) continue;

            const productQuery = connection.isPostgreSQL
                ? `SELECT label, category, amount, quantity, discount_amount, discount_unit, total
                 FROM transaction_items
                 WHERE transaction_id = $1`
                : `SELECT label, category, amount, quantity, discount_amount, discount_unit, total
                 FROM transaction_items
                 WHERE transaction_id = ?`;
            const [productRows] = await connection.execute(productQuery, [row.id]);

            const products = (productRows as ProductRow[]).map((p) => ({
                label: p.label || '',
                category: p.category || '',
                amount: Number(p.amount),
                quantity: Number(p.quantity),
                discount: {
                    amount: Number(p.discount_amount) || 0,
                    unit: p.discount_unit || '%',
                },
                total: Number(p.total),
            }));

            transactions.push({
                validator: row.validator || '',
                method: row.method || '',
                amount: Number(row.amount),
                currency: row.currency || '',
                createdDate: Number(row.createdDate),
                modifiedDate: Number(row.modifiedDate) || Number(row.createdDate),
                products,
                ...(row.short_num_order ? { shortNumOrder: String(row.short_num_order) } : {}),
            });
        }

        await connection.end();

        return NextResponse.json({ transactions }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching transactions' }, { status: 500 });
    }
}
