import { isDeletedTransaction } from '@/app/contexts/dataProvider/transactionHelpers';
import { DEFAULT_USER, DEFAULT_VAT_RATE } from '@/app/utils/constants';
import { Transaction } from '@/app/utils/interfaces';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface TransactionRow {
    id: number;
    order_id: string;
    short_num_order: string | null;
    validator: string;
    method: string;
    amount: number;
    currency: string;
    note: string;
    createddate?: number; // PostgreSQL lowercases unquoted aliases
    modifieddate?: number;
    createdDate?: number; // MariaDB preserves case
    modifiedDate?: number;
}

interface ProductRow {
    transaction_id: number;
    label: string;
    category: string;
    amount: number;
    quantity: number;
    discount_amount: number;
    discount_unit: string;
    total: number;
    vat_rate: number;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // Format: YYYY-MM-DD
    const period = searchParams.get('period'); // 'day' or 'full'
    const includeDeleted = searchParams.get('includeDeleted') === 'true';
    // Pagination (used for 'full' sync to avoid huge responses / timeouts)
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const limit = limitParam ? Math.max(1, parseInt(limitParam, 10)) : null;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10)) : 0;

    try {
        const connection = await getPosDb();
        const isPg = connection.isPostgreSQL;

        let whereClause = '1=1';
        const params: (string | number)[] = [DEFAULT_USER];
        let paramIndex = 2; // $1 is reserved for DEFAULT_USER in the validator COALESCE

        // Filter by date if provided
        if (date && period === 'day') {
            whereClause += isPg ? ` AND DATE(t.created_at) = $${paramIndex}` : ' AND DATE(t.created_at) = ?';
            params.push(date);
            paramIndex++;
        }

        // Pagination clause (only when a limit is requested)
        let paginationClause = '';
        if (limit !== null) {
            if (isPg) {
                paginationClause = ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
                params.push(limit, offset);
                paramIndex += 2;
            } else {
                paginationClause = ' LIMIT ? OFFSET ?';
                params.push(limit, offset);
            }
        }

        // Query to get transactions with their products
        // Note: created_at / updated_at are stored as UTC strings (via toSQLDateTime → .toISOString()).
        // UNIX_TIMESTAMP() interprets them as server-local time, so we compensate with
        // TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) which equals the server UTC offset
        // (e.g. +3600 for Europe/Paris in winter). This prevents a 1-hour gap that would cause
        // mergeTransactionArrays to treat the same transaction as two distinct entries.
        const query = isPg
            ? `
            SELECT
                t.id,
                t.order_id,
                o.short_order_number AS short_num_order,
                COALESCE(t.user_name, $1) as validator,
                t.payment_method as method,
                t.amount,
                t.currency,
                t.note,
                (EXTRACT(EPOCH FROM t.created_at) * 1000)::bigint as createddate,
                (EXTRACT(EPOCH FROM t.updated_at) * 1000)::bigint as modifieddate
            FROM transactions t
            LEFT JOIN dc.orders o ON o.id::text = t.order_id
            WHERE ${whereClause}
            ORDER BY t.created_at DESC${paginationClause}
        `
            : `
            SELECT
                t.id,
                t.order_id,
                o.short_order_number AS short_num_order,
                COALESCE(t.user_name, ?) as validator,
                t.payment_method as method,
                t.amount,
                t.currency,
                t.note,
                (UNIX_TIMESTAMP(t.created_at) + TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())) * 1000 as createdDate,
                (UNIX_TIMESTAMP(t.updated_at) + TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())) * 1000 as modifiedDate
            FROM transactions t
            LEFT JOIN \`DC\`.orders o ON o.id = t.order_id
            WHERE ${whereClause}
            ORDER BY t.created_at DESC${paginationClause}
        `;

        const [rows] = await connection.execute(query, params);
        const transactionRows = rows as TransactionRow[];

        // Fetch ALL items for the fetched transactions in a single query (avoids N+1).
        const ids = transactionRows.map((r) => r.id);
        const itemsByTx = new Map<number, ProductRow[]>();
        if (ids.length) {
            const placeholders = ids.map((_, i) => (isPg ? `$${i + 1}` : '?')).join(', ');
            const itemsQuery = `SELECT transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total, vat_rate
                 FROM transaction_items
                 WHERE transaction_id IN (${placeholders})`;
            const [itemRows] = await connection.execute(itemsQuery, ids);
            for (const p of itemRows as ProductRow[]) {
                const arr = itemsByTx.get(p.transaction_id) ?? [];
                arr.push(p);
                itemsByTx.set(p.transaction_id, arr);
            }
        }

        // Build transactions
        const transactions: Transaction[] = [];
        for (const row of transactionRows) {
            // Skip deleted transactions unless explicitly included (for sync)
            if (!includeDeleted && isDeletedTransaction({ method: row.method } as Transaction)) continue;

            const products = (itemsByTx.get(row.id) ?? []).map((p) => ({
                label: p.label || '',
                category: p.category || '',
                amount: Number(p.amount),
                quantity: Number(p.quantity),
                discount: {
                    amount: Number(p.discount_amount) || 0,
                    unit: p.discount_unit || '%',
                },
                total: Number(p.total),
                vatRate: p.vat_rate != null ? Number(p.vat_rate) : DEFAULT_VAT_RATE,
            }));

            const createdDate = Number(row.createddate ?? row.createdDate);
            if (!createdDate) continue; // skip rows with null/invalid created_at

            transactions.push({
                validator: row.validator || '',
                method: row.method || '',
                amount: Number(row.amount),
                currency: row.currency || '',
                createdDate,
                modifiedDate: Number(row.modifieddate ?? row.modifiedDate) || createdDate,
                products,
                ...(row.short_num_order ? { shortNumOrder: String(row.short_num_order) } : {}),
            });
        }

        await connection.end();

        // hasMore tells the client (for paginated 'full' sync) to fetch the next batch.
        const hasMore = limit !== null ? transactionRows.length === limit : false;

        return NextResponse.json({ transactions, hasMore }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching transactions' }, { status: 500 });
    }
}
