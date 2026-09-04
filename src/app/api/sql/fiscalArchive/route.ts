import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { insertAuditEvent } from '../auditHelpers';

export const dynamic = 'force-dynamic';

interface ArchiveTransaction {
    id: number;
    order_id: string;
    customer_name: string | null;
    user_name: string;
    payment_method: string;
    amount: number;
    currency: string;
    hash: string | null;
    previous_hash: string | null;
    created_at: string;
    updated_at: string;
    items: ArchiveTransactionItem[];
}

interface ArchiveTransactionItem {
    id: number;
    label: string;
    category: string | null;
    amount: number;
    quantity: number;
    total: number;
    vat_rate: number;
}

interface ArchiveExport {
    export_date: string;
    period_start: string;
    period_end: string;
    software: string;
    version: string;
    transactions: ArchiveTransaction[];
    daily_closures: unknown[];
    monthly_closures: unknown[];
    annual_closures: unknown[];
    perpetual_totals: unknown;
    audit_events: unknown[];
}

const SOFTWARE_NAME = 'Tradiz POS';
const SOFTWARE_VERSION = '1.0.0';

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('start_date');
        const endDate = searchParams.get('end_date');
        const requestedBy = searchParams.get('requested_by') || 'system';

        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
        }

        connection = await getPosDb(shopId);
        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';

        // Fetch transactions in date range
        const txQuery = isPg
            ? `SELECT id, order_id, customer_name, user_name, payment_method, amount, currency, hash, previous_hash, created_at, updated_at FROM ${prefix}transactions WHERE created_at >= $1 AND created_at <= $2 ORDER BY id ASC`
            : `SELECT id, order_id, customer_name, user_name, payment_method, amount, currency, hash, previous_hash, created_at, updated_at FROM ${prefix}transactions WHERE created_at >= ? AND created_at <= ? ORDER BY id ASC`;
        const [txRows] = await connection.execute(txQuery, [startDate, endDate]);
        const transactions = txRows as ArchiveTransaction[];

        // Fetch items for each transaction
        if (transactions.length > 0) {
            const txIds = transactions.map((t) => t.id);
            const placeholders = txIds.map((_, i) => (isPg ? `$${i + 1}` : '?')).join(', ');
            const itemsQuery = isPg
                ? `SELECT id, transaction_id, label, category, amount, quantity, total, vat_rate FROM ${prefix}transaction_items WHERE transaction_id IN (${placeholders}) ORDER BY transaction_id, id`
                : `SELECT id, transaction_id, label, category, amount, quantity, total, vat_rate FROM ${prefix}transaction_items WHERE transaction_id IN (${placeholders}) ORDER BY transaction_id, id`;
            const [itemRows] = await connection.execute(itemsQuery, txIds);
            const items = itemRows as (ArchiveTransactionItem & { transaction_id: number })[];

            const itemsByTx = new Map<number, ArchiveTransactionItem[]>();
            for (const item of items) {
                const list = itemsByTx.get(item.transaction_id) ?? [];
                list.push({
                    id: item.id,
                    label: item.label,
                    category: item.category,
                    amount: item.amount,
                    quantity: item.quantity,
                    total: item.total,
                    vat_rate: item.vat_rate,
                });
                itemsByTx.set(item.transaction_id, list);
            }
            for (const tx of transactions) {
                tx.items = itemsByTx.get(tx.id) ?? [];
            }
        }

        // Fetch closures in date range
        const dailyQuery = isPg
            ? `SELECT * FROM ${prefix}daily_closures WHERE closure_date >= $1 AND closure_date <= $2 ORDER BY closure_date ASC`
            : `SELECT * FROM ${prefix}daily_closures WHERE closure_date >= ? AND closure_date <= ? ORDER BY closure_date ASC`;
        const [dailyRows] = await connection.execute(dailyQuery, [startDate, endDate]);

        const monthlyQuery = isPg
            ? `SELECT * FROM ${prefix}monthly_closures WHERE closure_month >= $1 AND closure_month <= $2 ORDER BY closure_month ASC`
            : `SELECT * FROM ${prefix}monthly_closures WHERE closure_month >= ? AND closure_month <= ? ORDER BY closure_month ASC`;
        const [monthlyRows] = await connection.execute(monthlyQuery, [startDate, endDate]);

        const annualQuery = isPg
            ? `SELECT * FROM ${prefix}annual_closures WHERE closure_year >= EXTRACT(YEAR FROM $1::date) AND closure_year <= EXTRACT(YEAR FROM $2::date) ORDER BY closure_year ASC`
            : `SELECT * FROM ${prefix}annual_closures WHERE closure_year >= YEAR(?) AND closure_year <= YEAR(?) ORDER BY closure_year ASC`;
        const [annualRows] = await connection.execute(annualQuery, [startDate, endDate]);

        // Fetch perpetual totals
        const [perpetualRows] = await connection.execute(`SELECT * FROM ${prefix}perpetual_totals WHERE id = 1`);
        const perpetualTotals = (perpetualRows as unknown[])[0] ?? null;

        // Fetch audit events in date range
        const auditQuery = isPg
            ? `SELECT * FROM ${prefix}audit_events WHERE created_at >= $1 AND created_at <= $2 ORDER BY id ASC`
            : `SELECT * FROM ${prefix}audit_events WHERE created_at >= ? AND created_at <= ? ORDER BY id ASC`;
        const [auditRows] = await connection.execute(auditQuery, [startDate, endDate]);

        const archive: ArchiveExport = {
            export_date: new Date().toISOString(),
            period_start: startDate,
            period_end: endDate,
            software: SOFTWARE_NAME,
            version: SOFTWARE_VERSION,
            transactions,
            daily_closures: dailyRows,
            monthly_closures: monthlyRows,
            annual_closures: annualRows,
            perpetual_totals: perpetualTotals,
            audit_events: auditRows,
        };

        // Trace the export in audit events
        await insertAuditEvent(connection, {
            event_type: 'archive_export',
            entity_type: 'archive',
            entity_id: `${startDate}_${endDate}`,
            user_name: requestedBy,
            detail: `transactions=${transactions.length} daily_closures=${(dailyRows as unknown[]).length}`,
        });

        const filename = `archive_${startDate}_${endDate}.json`;
        return new NextResponse(JSON.stringify(archive, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error('Error generating archive export:', error);
        return NextResponse.json({ error: 'An error occurred while generating archive export' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
