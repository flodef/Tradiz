import { DELETED_KEYWORD, DEFAULT_USER } from '@/app/utils/constants';
import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';
import { getBalanceAffectingEntries } from '../customerBalanceHelpers';

interface TransactionRow {
    id: number;
    order_id: string | null;
    short_num_order: string | null;
    validator: string;
    method: string;
    amount: number;
    currency: string;
    note: string | null;
    createddate: number;
    modifieddate: number;
    createdDate?: number;
    modifiedDate?: number;
}

interface ProductRow {
    transaction_id: number;
    label: string | null;
    category: string | null;
    amount: number;
    quantity: number;
    discount_amount: number;
    discount_unit: string;
    total: number;
    vat_rate: number;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const customerName = searchParams.get('customerName');
    const customerIdParam = searchParams.get('customerId');
    const customerId = customerIdParam ? parseInt(customerIdParam, 10) : null;

    if (!customerName) {
        return NextResponse.json({ error: 'Missing customerName parameter' }, { status: 400 });
    }
    if (customerIdParam && (customerId === null || isNaN(customerId))) {
        return NextResponse.json({ error: 'Invalid customerId parameter' }, { status: 400 });
    }

    try {
        const connection = await getPosDb(shopId);
        const isPg = connection.isPostgreSQL;

        // Aggregate totals: number of purchases, total purchase amount, and total discount value.
        const totalsQuery = isPg
            ? `
            SELECT
                COUNT(*) AS purchase_count,
                COALESCE(SUM(transaction_amount), 0) AS total_amount,
                COALESCE(SUM(discount), 0) AS total_discount
            FROM (
                SELECT
                    t.id,
                    t.amount AS transaction_amount,
                    COALESCE(SUM((ti.amount * ti.quantity) - ti.total), 0) AS discount
                FROM dc_pos.transactions t
                LEFT JOIN dc_pos.transaction_items ti ON ti.transaction_id = t.id
                WHERE t.customer_name = $1 AND t.payment_method != $2
                GROUP BY t.id, t.amount
                HAVING COUNT(ti.id) > 0
            ) sub
        `
            : `
            SELECT
                COUNT(*) AS purchase_count,
                COALESCE(SUM(transaction_amount), 0) AS total_amount,
                COALESCE(SUM(discount), 0) AS total_discount
            FROM (
                SELECT
                    t.id,
                    t.amount AS transaction_amount,
                    COALESCE(SUM((ti.amount * ti.quantity) - ti.total), 0) AS discount
                FROM transactions t
                LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
                WHERE t.customer_name = ? AND t.payment_method != ?
                GROUP BY t.id, t.amount
                HAVING COUNT(ti.id) > 0
            ) sub
        `;

        const [[totals]] = await connection.execute(totalsQuery, [customerName, DELETED_KEYWORD]);

        // Latest 10 non-deleted transactions for this customer.
        const transactionsQuery = isPg
            ? `
            SELECT
                t.id,
                t.order_id,
                o.short_order_number AS short_num_order,
                COALESCE(t.user_name, $2) as validator,
                t.payment_method as method,
                t.amount,
                t.currency,
                t.note,
                (EXTRACT(EPOCH FROM t.created_at) * 1000)::bigint as createddate,
                (EXTRACT(EPOCH FROM t.updated_at) * 1000)::bigint as modifieddate
            FROM dc_pos.transactions t
            LEFT JOIN dc.orders o ON o.id::text = t.order_id
            WHERE t.customer_name = $1 AND t.payment_method != $3
            ORDER BY t.created_at DESC
            LIMIT 10
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
            WHERE t.customer_name = ? AND t.payment_method != ?
            ORDER BY t.created_at DESC
            LIMIT 10
        `;

        const params = isPg
            ? [customerName, DEFAULT_USER, DELETED_KEYWORD]
            : [DEFAULT_USER, customerName, DELETED_KEYWORD];
        const [transactionRows] = await connection.execute(transactionsQuery, params);
        const rows = transactionRows as TransactionRow[];

        // Running balances are derived from the transactions table (single source of truth),
        // then attached to the balance-affecting transactions by id.
        const { entries } = await getBalanceAffectingEntries(connection, customerName);
        const balanceById = new Map(entries.map((entry) => [String(entry.id), entry]));

        const ids = rows.map((r) => r.id);
        const itemsByTx = new Map<number, ProductRow[]>();
        if (ids.length) {
            const placeholders = ids.map((_, i) => (isPg ? `$${i + 1}` : '?')).join(', ');
            const itemsQuery = isPg
                ? `SELECT transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total, vat_rate
                   FROM dc_pos.transaction_items
                   WHERE transaction_id IN (${placeholders})`
                : `SELECT transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total, vat_rate
                   FROM transaction_items
                   WHERE transaction_id IN (${placeholders})`;
            const [itemRows] = await connection.execute(itemsQuery, ids);
            for (const p of itemRows as ProductRow[]) {
                const arr = itemsByTx.get(p.transaction_id) ?? [];
                arr.push(p);
                itemsByTx.set(p.transaction_id, arr);
            }
        }

        const transactions = rows.map((row) => {
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
                vatRate: p.vat_rate != null ? Number(p.vat_rate) : 20,
            }));

            const balanceEntry = balanceById.get(String(row.id));

            return {
                validator: row.validator || '',
                method: row.method || '',
                amount: Number(row.amount),
                currency: row.currency || '',
                createdDate: Number(row.createddate ?? row.createdDate),
                modifiedDate:
                    Number(row.modifieddate ?? row.modifiedDate) || Number(row.createddate ?? row.createdDate),
                products,
                ...(row.short_num_order ? { shortNumOrder: String(row.short_num_order) } : {}),
                ...(balanceEntry ? { previousBalance: balanceEntry.previousBalance } : {}),
                ...(balanceEntry ? { newBalance: balanceEntry.newBalance } : {}),
            };
        });

        await connection.end();

        return NextResponse.json(
            {
                transactions,
                purchaseCount: Number((totals as { purchase_count: number | string }).purchase_count ?? 0),
                totalAmount: Number((totals as { total_amount: number | string }).total_amount ?? 0),
                totalDiscount: Number((totals as { total_discount: number | string }).total_discount ?? 0),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Error getting customer transactions:', error);
        return NextResponse.json({ error: 'An error occurred while getting customer transactions' }, { status: 500 });
    }
}
