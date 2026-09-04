import { DbConnection } from './db';
import {
    CANCELLED_KEYWORD,
    DELETED_KEYWORD,
    HARD_DELETED_KEYWORD,
    UPDATING_KEYWORD,
    WAITING_KEYWORD,
    PROCESSING_KEYWORD,
} from '@/app/utils/constants';
import { VatBreakdownEntry, VentilationEntry, PaymentTotalEntry } from '@/app/utils/interfaces';

const EXCLUDED = [
    DELETED_KEYWORD,
    CANCELLED_KEYWORD,
    HARD_DELETED_KEYWORD,
    WAITING_KEYWORD,
    UPDATING_KEYWORD,
    PROCESSING_KEYWORD,
];

export interface CompanyTransactionStats {
    ticketCount: number;
    customerPaidAmount: number;
    refundCount: number;
    vatBreakdown: VatBreakdownEntry[];
    ventilations: VentilationEntry[];
    paymentTotals: PaymentTotalEntry[];
}

function ne(pg: boolean) {
    return pg ? "TRIM(c.first_name || ' ' || c.last_name)" : "TRIM(CONCAT(c.first_name, ' ', c.last_name))";
}
function ep(pg: boolean, off: number) {
    return EXCLUDED.map((_, i) => (pg ? `$${off + i}` : '?')).join(', ');
}
function ns(pg: boolean, s: string) {
    return pg
        ? `SELECT ${ne(pg)} AS fn FROM ${s}customers c WHERE c.company = $1`
        : `SELECT ${ne(pg)} AS fn FROM ${s}customers c WHERE c.company = ?`;
}

export async function getCompanyTransactionStats(
    conn: DbConnection,
    company: string,
    startAt: string,
    endAt: string
): Promise<CompanyTransactionStats> {
    const pg = conn.isPostgreSQL;
    const s = pg ? 'dc_pos.' : '';
    const P = pg ? [company, startAt, endAt, ...EXCLUDED] : [company, startAt, endAt, ...EXCLUDED];

    // 1. Ticket count (all transactions in date range)
    const tq = pg
        ? `SELECT COUNT(*)::int c FROM ${s}transactions t WHERE t.created_at>=$1 AND t.created_at<$2 AND t.payment_method NOT IN (${ep(pg, 3)})`
        : `SELECT COUNT(*) c FROM ${s}transactions t WHERE t.created_at>=? AND t.created_at<? AND t.payment_method NOT IN (${ep(pg, 3)})`;
    const [tr] = await conn.execute(tq, pg ? [startAt, endAt, ...EXCLUDED] : [startAt, endAt, ...EXCLUDED]);
    const ticketCount = Number((tr as { c: number }[])[0]?.c ?? 0);

    // 2. Customer-paid amount & refund count
    const sq = pg
        ? `SELECT COALESCE(SUM(t.amount),0) ta, COALESCE(SUM(CASE WHEN t.amount<0 THEN 1 ELSE 0 END),0)::int rc FROM ${s}transactions t WHERE TRIM(t.customer_name) IN (${ns(pg, s)}) AND t.created_at>=$2 AND t.created_at<$3 AND t.payment_method NOT IN (${ep(pg, 4)}) AND EXISTS(SELECT 1 FROM ${s}transaction_items ti WHERE ti.transaction_id=t.id)`
        : `SELECT COALESCE(SUM(t.amount),0) ta, COALESCE(SUM(CASE WHEN t.amount<0 THEN 1 ELSE 0 END),0) rc FROM ${s}transactions t WHERE TRIM(t.customer_name) IN (${ns(pg, s)}) AND t.created_at>=? AND t.created_at<? AND t.payment_method NOT IN (${ep(pg, 4)}) AND EXISTS(SELECT 1 FROM ${s}transaction_items ti WHERE ti.transaction_id=t.id)`;
    const [sr] = await conn.execute(sq, P);
    const sR = (sr as { ta: number; rc: number }[])[0];
    const customerPaidAmount = Number(sR?.ta ?? 0);
    const refundCount = Number(sR?.rc ?? 0);

    // 3. VAT breakdown
    const vq = pg
        ? `SELECT ti.vat_rate vr, COALESCE(SUM(ti.quantity),0)::int q, COALESCE(SUM(ti.total),0) ca FROM ${s}transaction_items ti JOIN ${s}transactions t ON ti.transaction_id=t.id WHERE TRIM(t.customer_name) IN (${ns(pg, s)}) AND t.created_at>=$2 AND t.created_at<$3 AND t.payment_method NOT IN (${ep(pg, 4)}) GROUP BY ti.vat_rate ORDER BY ti.vat_rate`
        : `SELECT ti.vat_rate vr, COALESCE(SUM(ti.quantity),0) q, COALESCE(SUM(ti.total),0) ca FROM ${s}transaction_items ti JOIN ${s}transactions t ON ti.transaction_id=t.id WHERE TRIM(t.customer_name) IN (${ns(pg, s)}) AND t.created_at>=? AND t.created_at<? AND t.payment_method NOT IN (${ep(pg, 4)}) GROUP BY ti.vat_rate ORDER BY ti.vat_rate`;
    const [vr] = await conn.execute(vq, P);
    const vatBreakdown: VatBreakdownEntry[] = (vr as { vr: number; q: number; ca: number }[]).map((r) => {
        const rate = Number(r.vr) / 100,
            ca = Number(r.ca),
            ht = ca / (1 + rate);
        return {
            vatRate: rate,
            label: rate === 0 ? 'EXO' : `TVA ${Number(r.vr).toFixed(0)}%`,
            quantity: Number(r.q),
            ca,
            ht: Number(ht.toFixed(2)),
            tva: Number((ca - ht).toFixed(2)),
        };
    });

    // 4. Ventilations
    const ventq = pg
        ? `SELECT ti.category cat, COALESCE(SUM(ti.quantity),0)::int q, COALESCE(SUM(ti.total),0) amt FROM ${s}transaction_items ti JOIN ${s}transactions t ON ti.transaction_id=t.id WHERE TRIM(t.customer_name) IN (${ns(pg, s)}) AND t.created_at>=$2 AND t.created_at<$3 AND t.payment_method NOT IN (${ep(pg, 4)}) GROUP BY ti.category ORDER BY ti.category`
        : `SELECT ti.category cat, COALESCE(SUM(ti.quantity),0) q, COALESCE(SUM(ti.total),0) amt FROM ${s}transaction_items ti JOIN ${s}transactions t ON ti.transaction_id=t.id WHERE TRIM(t.customer_name) IN (${ns(pg, s)}) AND t.created_at>=? AND t.created_at<? AND t.payment_method NOT IN (${ep(pg, 4)}) GROUP BY ti.category ORDER BY ti.category`;
    const [vtr] = await conn.execute(ventq, P);
    const ventilations: VentilationEntry[] = (vtr as { cat: string; q: number; amt: number }[]).map((r) => ({
        category: String(r.cat ?? 'N/A'),
        quantity: Number(r.q),
        amount: Number(r.amt),
    }));

    // 5. Payment totals
    const pq = pg
        ? `SELECT t.payment_method pm, COUNT(*)::int c, COALESCE(SUM(t.amount),0) amt FROM ${s}transactions t WHERE TRIM(t.customer_name) IN (${ns(pg, s)}) AND t.created_at>=$2 AND t.created_at<$3 AND t.payment_method NOT IN (${ep(pg, 4)}) AND EXISTS(SELECT 1 FROM ${s}transaction_items ti WHERE ti.transaction_id=t.id) GROUP BY t.payment_method ORDER BY t.payment_method`
        : `SELECT t.payment_method pm, COUNT(*) c, COALESCE(SUM(t.amount),0) amt FROM ${s}transactions t WHERE TRIM(t.customer_name) IN (${ns(pg, s)}) AND t.created_at>=? AND t.created_at<? AND t.payment_method NOT IN (${ep(pg, 4)}) AND EXISTS(SELECT 1 FROM ${s}transaction_items ti WHERE ti.transaction_id=t.id) GROUP BY t.payment_method ORDER BY t.payment_method`;
    const [pr] = await conn.execute(pq, P);
    const paymentTotals: PaymentTotalEntry[] = (pr as { pm: string; c: number; amt: number }[]).map((r) => ({
        method: String(r.pm),
        count: Number(r.c),
        amount: Number(r.amt),
    }));

    return { ticketCount, customerPaidAmount, refundCount, vatBreakdown, ventilations, paymentTotals };
}
