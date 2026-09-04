import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { createHash } from 'crypto';
import {
    DELETED_KEYWORD,
    CANCELLED_KEYWORD,
    HARD_DELETED_KEYWORD,
    REFUND_KEYWORD,
    UPDATING_KEYWORD,
    PROCESSING_KEYWORD,
    WAITING_KEYWORD,
} from '@/app/utils/constants';
import { insertAuditEvent } from '../auditHelpers';

export const dynamic = 'force-dynamic';

const EXCLUDED_METHODS = [
    DELETED_KEYWORD,
    CANCELLED_KEYWORD,
    HARD_DELETED_KEYWORD,
    UPDATING_KEYWORD,
    PROCESSING_KEYWORD,
    WAITING_KEYWORD,
];

interface DailyTotals {
    ticket_count: number;
    total_amount: number;
    total_ht: number;
    total_tva: number;
    cancellation_count: number;
    cancellation_amount: number;
    refund_count: number;
    refund_amount: number;
}

async function computeDailyTotals(connection: DbConnection, date: string): Promise<DailyTotals> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const placeholders = EXCLUDED_METHODS.map((_, i) => (isPg ? `$${i + 2}` : '?')).join(', ');

    // Paid transactions (exclude non-paid methods) — immutable calendar day (00:00 to 24:00)
    const paidQuery = isPg
        ? `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0)::numeric AS total FROM ${prefix}transactions WHERE DATE(created_at) = $1 AND payment_method NOT IN (${placeholders})`
        : `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total FROM ${prefix}transactions WHERE DATE(created_at) = ? AND payment_method NOT IN (${placeholders})`;

    const paidParams = isPg ? [date, ...EXCLUDED_METHODS] : [date, ...EXCLUDED_METHODS];
    const [paidRows] = await connection.execute(paidQuery, paidParams);
    const paidResult = (paidRows as { cnt: number; total: number | string }[])[0];

    // Cancellations and deletions
    const cancelMethods = [DELETED_KEYWORD, CANCELLED_KEYWORD, HARD_DELETED_KEYWORD];
    const cancelPlaceholders = cancelMethods.map((_, i) => (isPg ? `$${i + 2}` : '?')).join(', ');
    const cancelQuery = isPg
        ? `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(ABS(amount)), 0)::numeric AS total FROM ${prefix}transactions WHERE DATE(created_at) = $1 AND payment_method IN (${cancelPlaceholders})`
        : `SELECT COUNT(*) AS cnt, COALESCE(SUM(ABS(amount)), 0) AS total FROM ${prefix}transactions WHERE DATE(created_at) = ? AND payment_method IN (${cancelPlaceholders})`;
    const cancelParams = isPg ? [date, ...cancelMethods] : [date, ...cancelMethods];
    const [cancelRows] = await connection.execute(cancelQuery, cancelParams);
    const cancelResult = (cancelRows as { cnt: number; total: number | string }[])[0];

    // Refunds
    const refundQuery = isPg
        ? `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(ABS(amount)), 0)::numeric AS total FROM ${prefix}transactions WHERE DATE(created_at) = $1 AND payment_method = $2`
        : `SELECT COUNT(*) AS cnt, COALESCE(SUM(ABS(amount)), 0) AS total FROM ${prefix}transactions WHERE DATE(created_at) = ? AND payment_method = ?`;
    const [refundRows] = await connection.execute(refundQuery, [date, REFUND_KEYWORD]);
    const refundResult = (refundRows as { cnt: number; total: number | string }[])[0];

    const totalAmount = Number(paidResult.total) || 0;
    // HT and TVA computed from transaction_items joined with transactions
    const vatQuery = isPg
        ? `SELECT COALESCE(SUM(ti.total * ti.vat_rate / 100), 0)::numeric AS tva, COALESCE(SUM(ti.total), 0)::numeric AS ht FROM ${prefix}transaction_items ti JOIN ${prefix}transactions t ON t.id = ti.transaction_id WHERE DATE(t.created_at) = $1 AND t.payment_method NOT IN (${placeholders})`
        : `SELECT COALESCE(SUM(ti.total * ti.vat_rate / 100), 0) AS tva, COALESCE(SUM(ti.total), 0) AS ht FROM ${prefix}transaction_items ti JOIN ${prefix}transactions t ON t.id = ti.transaction_id WHERE DATE(t.created_at) = ? AND t.payment_method NOT IN (${placeholders})`;
    const [vatRows] = await connection.execute(vatQuery, paidParams);
    const vatResult = (vatRows as { tva: number | string; ht: number | string }[])[0];

    return {
        ticket_count: Number(paidResult.cnt) || 0,
        total_amount: totalAmount,
        total_ht: Number(vatResult.ht) || 0,
        total_tva: Number(vatResult.tva) || 0,
        cancellation_count: Number(cancelResult.cnt) || 0,
        cancellation_amount: Number(cancelResult.total) || 0,
        refund_count: Number(refundResult.cnt) || 0,
        refund_amount: Number(refundResult.total) || 0,
    };
}

async function getLatestDailyClosureHash(connection: DbConnection): Promise<string | null> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const query = `SELECT closure_hash FROM ${prefix}daily_closures ORDER BY id DESC LIMIT 1`;
    const [rows] = await connection.execute(query);
    const result = (rows as { closure_hash: string | null }[])[0];
    return result?.closure_hash ?? null;
}

function generateClosureHash(date: string, totals: DailyTotals, previousHash: string | null): string {
    const data = [
        previousHash || '',
        date,
        totals.ticket_count,
        totals.total_amount,
        totals.total_ht,
        totals.total_tva,
        totals.cancellation_count,
        totals.cancellation_amount,
        totals.refund_count,
        totals.refund_amount,
    ].join('|');
    return createHash('sha256').update(data).digest('hex');
}

async function updatePerpetualTotals(
    connection: DbConnection,
    totals: DailyTotals,
    closureHash: string
): Promise<void> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';

    if (isPg) {
        await connection.execute(
            `INSERT INTO ${prefix}perpetual_totals (id, total_ticket_count, total_amount, total_ht, total_tva, total_cancellation_count, total_refund_count, last_closure_hash, updated_at)
             VALUES (1, $1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
                total_ticket_count = perpetual_totals.total_ticket_count + EXCLUDED.total_ticket_count,
                total_amount = perpetual_totals.total_amount + EXCLUDED.total_amount,
                total_ht = perpetual_totals.total_ht + EXCLUDED.total_ht,
                total_tva = perpetual_totals.total_tva + EXCLUDED.total_tva,
                total_cancellation_count = perpetual_totals.total_cancellation_count + EXCLUDED.total_cancellation_count,
                total_refund_count = perpetual_totals.total_refund_count + EXCLUDED.total_refund_count,
                last_closure_hash = EXCLUDED.last_closure_hash,
                updated_at = CURRENT_TIMESTAMP`,
            [
                totals.ticket_count,
                totals.total_amount,
                totals.total_ht,
                totals.total_tva,
                totals.cancellation_count,
                totals.refund_count,
                closureHash,
            ]
        );
    } else {
        // MariaDB: use INSERT ... ON DUPLICATE KEY UPDATE
        await connection.execute(
            `INSERT INTO ${prefix}perpetual_totals (id, total_ticket_count, total_amount, total_ht, total_tva, total_cancellation_count, total_refund_count, last_closure_hash, updated_at)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
                total_ticket_count = total_ticket_count + VALUES(total_ticket_count),
                total_amount = total_amount + VALUES(total_amount),
                total_ht = total_ht + VALUES(total_ht),
                total_tva = total_tva + VALUES(total_tva),
                total_cancellation_count = total_cancellation_count + VALUES(total_cancellation_count),
                total_refund_count = total_refund_count + VALUES(total_refund_count),
                last_closure_hash = VALUES(last_closure_hash),
                updated_at = CURRENT_TIMESTAMP`,
            [
                totals.ticket_count,
                totals.total_amount,
                totals.total_ht,
                totals.total_tva,
                totals.cancellation_count,
                totals.refund_count,
                closureHash,
            ]
        );
    }
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { date, closed_by } = (await request.json()) as { date: string; closed_by: string };

        if (!date || !closed_by) {
            return NextResponse.json({ error: 'date and closed_by are required' }, { status: 400 });
        }

        connection = await getPosDb(shopId);
        await connection.beginTransaction();

        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';

        // Check if closure already exists for this date
        const checkQuery = isPg
            ? `SELECT id FROM ${prefix}daily_closures WHERE closure_date = $1`
            : `SELECT id FROM ${prefix}daily_closures WHERE closure_date = ?`;
        const [existing] = await connection.execute(checkQuery, [date]);
        if ((existing as { id: number }[]).length > 0) {
            await connection.rollback();
            return NextResponse.json({ error: 'Closure already exists for this date' }, { status: 409 });
        }

        // Compute totals — immutable calendar day (00:00 to 24:00) for audit integrity
        const totals = await computeDailyTotals(connection, date);

        // Generate chained hash
        const previousHash = await getLatestDailyClosureHash(connection);
        const closureHash = generateClosureHash(date, totals, previousHash);

        // Insert daily closure
        const insertQuery = isPg
            ? `INSERT INTO ${prefix}daily_closures (closure_date, ticket_count, total_amount, total_ht, total_tva, cancellation_count, cancellation_amount, refund_count, refund_amount, closure_hash, previous_closure_hash, closed_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`
            : `INSERT INTO ${prefix}daily_closures (closure_date, ticket_count, total_amount, total_ht, total_tva, cancellation_count, cancellation_amount, refund_count, refund_amount, closure_hash, previous_closure_hash, closed_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await connection.execute(insertQuery, [
            date,
            totals.ticket_count,
            totals.total_amount,
            totals.total_ht,
            totals.total_tva,
            totals.cancellation_count,
            totals.cancellation_amount,
            totals.refund_count,
            totals.refund_amount,
            closureHash,
            previousHash,
            closed_by,
        ]);

        // Update perpetual totals
        await updatePerpetualTotals(connection, totals, closureHash);

        // Audit event
        await insertAuditEvent(connection, {
            event_type: 'daily_closure',
            entity_type: 'daily_closure',
            entity_id: date,
            user_name: closed_by,
            detail: `tickets=${totals.ticket_count} total=${totals.total_amount} hash=${closureHash.slice(0, 16)}...`,
        });

        await connection.commit();

        return NextResponse.json(
            {
                success: true,
                closure: {
                    date,
                    ...totals,
                    closure_hash: closureHash,
                    previous_closure_hash: previousHash,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        await connection?.rollback();
        console.error('Error creating daily closure:', error);
        return NextResponse.json({ error: 'An error occurred while creating daily closure' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 365);

        connection = await getPosDb(shopId);
        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';

        if (date) {
            const query = `SELECT * FROM ${prefix}daily_closures WHERE closure_date = ${isPg ? '$1' : '?'}`;
            const [rows] = await connection.execute(query, [date]);
            return NextResponse.json({ closure: (rows as unknown[])[0] ?? null }, { status: 200 });
        }

        const listQuery = `SELECT * FROM ${prefix}daily_closures ORDER BY closure_date DESC LIMIT ${isPg ? '$1' : '?'}`;
        const [rows] = await connection.execute(listQuery, [limit]);
        return NextResponse.json({ closures: rows }, { status: 200 });
    } catch (error) {
        console.error('Error fetching daily closures:', error);
        return NextResponse.json({ error: 'An error occurred while fetching daily closures' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
