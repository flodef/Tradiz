import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { getPosPgDb, isPgConfigured } from '../pg-db';
import { computeTransactionHash, type TransactionItemHashInput } from '@/app/utils/transactionHash';
import { parsePaymentLegs } from '@/app/utils/transactionNote';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

interface TransactionRow {
    id: number;
    order_id: string;
    user_name: string;
    payment_method: string;
    amount: number | string;
    currency: string;
    created_at: string;
    change: string | null;
    device_id: string | null;
    payments: string | null;
    hash: string | null;
    previous_hash: string | null;
}

interface TransactionItemRow {
    transaction_id: number;
    label: string;
    quantity: number | string;
    amount: number | string;
    total: number | string;
    vat_rate: number | string | null;
    discount_amount: number | string | null;
}

interface ClosureRow {
    id: number;
    closure_hash: string | null;
    previous_closure_hash: string | null;
    [key: string]: unknown;
}

interface AuditRow {
    id: number;
    event_type: string;
    entity_type: string;
    entity_id: string | null;
    user_name: string;
    device_id: string | null;
    detail: string | null;
    event_hash: string | null;
    previous_event_hash: string | null;
    created_at: string;
}

interface ChainIssue {
    id: number;
    issue: string;
    stored_hash: string | null;
    computed_hash: string;
}

interface ChainResult {
    total: number;
    verified: number;
    issues_found: number;
    issues?: ChainIssue[];
    integrity_ok: boolean;
}

function recomputeHash(
    transactionId: number | string,
    tx: TransactionRow,
    previousHash: string | null,
    items?: TransactionItemHashInput[]
): string {
    return computeTransactionHash(
        { ...tx, items, payments: parsePaymentLegs(tx.payments) },
        transactionId,
        previousHash
    );
}

function recomputeDailyClosureHash(row: ClosureRow, previousHash: string | null): string {
    const data = [
        previousHash || '',
        String(row.closure_date ?? ''),
        String(row.ticket_count ?? 0),
        String(Number(row.total_amount ?? 0)),
        String(Number(row.total_ht ?? 0)),
        String(Number(row.total_tva ?? 0)),
        String(row.cancellation_count ?? 0),
        String(Number(row.cancellation_amount ?? 0)),
        String(row.refund_count ?? 0),
        String(Number(row.refund_amount ?? 0)),
    ].join('|');
    return createHash('sha256').update(data).digest('hex');
}

function recomputePeriodClosureHash(row: ClosureRow, previousHash: string | null): string {
    const period = String(row.closure_month ?? row.closure_year ?? '');
    const data = [
        previousHash || '',
        period,
        String(row.ticket_count ?? 0),
        String(Number(row.total_amount ?? 0)),
        String(Number(row.total_ht ?? 0)),
        String(Number(row.total_tva ?? 0)),
        String(row.daily_closure_count ?? row.monthly_closure_count ?? 0),
    ].join('|');
    return createHash('sha256').update(data).digest('hex');
}

function recomputeAuditEventHash(row: AuditRow, previousHash: string | null): string {
    const data = [
        previousHash || '',
        row.event_type,
        row.entity_type || 'transaction',
        row.entity_id || '',
        row.user_name,
        row.device_id || '',
        row.detail || '',
        String(row.created_at),
    ].join('|');
    return createHash('sha256').update(data).digest('hex');
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    let pgClient: Awaited<ReturnType<typeof getPosPgDb>> | undefined;
    try {
        const isPg = isPgConfigured(shopId);
        const prefix = isPg ? 'dc_pos.' : '';

        // Helper to run queries on either pgClient or DbConnection
        const query = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
            if (isPg && pgClient) {
                const result = await pgClient.query(sql, params);
                return result.rows as T[];
            } else if (connection) {
                const [rows] = await connection.execute(sql, params);
                return rows as T[];
            }
            return [];
        };

        if (isPg) {
            pgClient = await getPosPgDb(shopId);
            await pgClient.query('SET search_path TO dc_pos, dc, dc_sys, public');
        } else {
            connection = await getPosDb(shopId);
        }

        // ── 1. Transaction chain ──
        const transactions = await query<TransactionRow>(
            isPg
                ? 'SELECT id, order_id, user_name, payment_method, amount, currency, ' +
                      "to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at, " +
                      'change, device_id, payments, hash, previous_hash FROM transactions ORDER BY id ASC'
                : 'SELECT id, order_id, user_name, payment_method, amount, currency, ' +
                      "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at, " +
                      'change, device_id, payments, hash, previous_hash FROM transactions ORDER BY id ASC'
        );

        // Fetch all transaction items for hash verification
        const itemsByTransaction = new Map<number, TransactionItemHashInput[]>();
        if (transactions.length > 0) {
            const txIds = transactions.map((t) => t.id);
            const itemRows = isPg
                ? await query<TransactionItemRow>(
                      'SELECT transaction_id, label, quantity, amount, total, vat_rate, discount_amount ' +
                          'FROM transaction_items WHERE transaction_id = ANY($1::int[]) ORDER BY transaction_id, id',
                      [txIds]
                  )
                : await query<TransactionItemRow>(
                      'SELECT transaction_id, label, quantity, amount, total, vat_rate, discount_amount ' +
                          'FROM transaction_items ORDER BY transaction_id, id'
                  );
            for (const row of itemRows) {
                const list = itemsByTransaction.get(row.transaction_id) || [];
                list.push({
                    label: row.label,
                    quantity: Number(row.quantity),
                    amount: row.amount,
                    total: row.total,
                    vat_rate: row.vat_rate ?? undefined,
                    discount_amount: row.discount_amount ?? undefined,
                });
                itemsByTransaction.set(row.transaction_id, list);
            }
        }

        const txIssues: ChainIssue[] = [];
        let expectedPrevHash: string | null = null;
        let txVerified = 0;

        for (const tx of transactions) {
            if (tx.previous_hash !== expectedPrevHash) {
                txIssues.push({
                    id: tx.id,
                    issue: `Chain break: stored previous_hash="${tx.previous_hash?.slice(0, 16) ?? 'null'}..." but expected="${expectedPrevHash?.slice(0, 16) ?? 'null'}..."`,
                    stored_hash: tx.hash,
                    computed_hash: '',
                });
            }
            const items = itemsByTransaction.get(tx.id);
            const computedHash = recomputeHash(tx.id, tx, tx.previous_hash, items);
            if (tx.hash !== computedHash) {
                txIssues.push({
                    id: tx.id,
                    issue: `Hash mismatch: stored="${tx.hash}" but computed="${computedHash}"`,
                    stored_hash: tx.hash,
                    computed_hash: computedHash,
                });
            } else {
                txVerified++;
            }
            expectedPrevHash = tx.hash;
        }

        const txResult: ChainResult = {
            total: transactions.length,
            verified: txVerified,
            issues_found: txIssues.length,
            issues: txIssues.length > 0 ? txIssues : undefined,
            integrity_ok: txIssues.length === 0,
        };

        // ── 2. Daily closure chain ──
        const dailyClosures = await query<ClosureRow>(
            `SELECT id, closure_date, ticket_count, total_amount, total_ht, total_tva, cancellation_count, cancellation_amount, refund_count, refund_amount, closure_hash, previous_closure_hash FROM ${prefix}daily_closures ORDER BY id ASC`
        );
        const dailyIssues: ChainIssue[] = [];
        let expectedDailyPrev: string | null = null;
        let dailyVerified = 0;

        for (const row of dailyClosures) {
            if (row.previous_closure_hash !== expectedDailyPrev) {
                dailyIssues.push({
                    id: row.id,
                    issue: `Chain break: stored previous="${row.previous_closure_hash?.slice(0, 16) ?? 'null'}..." but expected="${expectedDailyPrev?.slice(0, 16) ?? 'null'}..."`,
                    stored_hash: row.closure_hash,
                    computed_hash: '',
                });
            }
            const computed = recomputeDailyClosureHash(row, row.previous_closure_hash);
            if (row.closure_hash !== computed) {
                dailyIssues.push({
                    id: row.id,
                    issue: `Hash mismatch: stored="${row.closure_hash}" but computed="${computed}"`,
                    stored_hash: row.closure_hash,
                    computed_hash: computed,
                });
            } else {
                dailyVerified++;
            }
            expectedDailyPrev = row.closure_hash;
        }

        const dailyResult: ChainResult = {
            total: dailyClosures.length,
            verified: dailyVerified,
            issues_found: dailyIssues.length,
            issues: dailyIssues.length > 0 ? dailyIssues : undefined,
            integrity_ok: dailyIssues.length === 0,
        };

        // ── 3. Monthly closure chain ──
        const monthlyClosures = await query<ClosureRow>(
            `SELECT id, closure_month, daily_closure_count, ticket_count, total_amount, total_ht, total_tva, closure_hash, previous_closure_hash FROM ${prefix}monthly_closures ORDER BY id ASC`
        );
        const monthlyIssues: ChainIssue[] = [];
        let expectedMonthlyPrev: string | null = null;
        let monthlyVerified = 0;

        for (const row of monthlyClosures) {
            if (row.previous_closure_hash !== expectedMonthlyPrev) {
                monthlyIssues.push({
                    id: row.id,
                    issue: `Chain break: stored previous="${row.previous_closure_hash?.slice(0, 16) ?? 'null'}..." but expected="${expectedMonthlyPrev?.slice(0, 16) ?? 'null'}..."`,
                    stored_hash: row.closure_hash,
                    computed_hash: '',
                });
            }
            const computed = recomputePeriodClosureHash(row, row.previous_closure_hash);
            if (row.closure_hash !== computed) {
                monthlyIssues.push({
                    id: row.id,
                    issue: `Hash mismatch: stored="${row.closure_hash}" but computed="${computed}"`,
                    stored_hash: row.closure_hash,
                    computed_hash: computed,
                });
            } else {
                monthlyVerified++;
            }
            expectedMonthlyPrev = row.closure_hash;
        }

        const monthlyResult: ChainResult = {
            total: monthlyClosures.length,
            verified: monthlyVerified,
            issues_found: monthlyIssues.length,
            issues: monthlyIssues.length > 0 ? monthlyIssues : undefined,
            integrity_ok: monthlyIssues.length === 0,
        };

        // ── 4. Annual closure chain ──
        const annualClosures = await query<ClosureRow>(
            `SELECT id, closure_year, monthly_closure_count, ticket_count, total_amount, total_ht, total_tva, closure_hash, previous_closure_hash FROM ${prefix}annual_closures ORDER BY id ASC`
        );
        const annualIssues: ChainIssue[] = [];
        let expectedAnnualPrev: string | null = null;
        let annualVerified = 0;

        for (const row of annualClosures) {
            if (row.previous_closure_hash !== expectedAnnualPrev) {
                annualIssues.push({
                    id: row.id,
                    issue: `Chain break: stored previous="${row.previous_closure_hash?.slice(0, 16) ?? 'null'}..." but expected="${expectedAnnualPrev?.slice(0, 16) ?? 'null'}..."`,
                    stored_hash: row.closure_hash,
                    computed_hash: '',
                });
            }
            const computed = recomputePeriodClosureHash(row, row.previous_closure_hash);
            if (row.closure_hash !== computed) {
                annualIssues.push({
                    id: row.id,
                    issue: `Hash mismatch: stored="${row.closure_hash}" but computed="${computed}"`,
                    stored_hash: row.closure_hash,
                    computed_hash: computed,
                });
            } else {
                annualVerified++;
            }
            expectedAnnualPrev = row.closure_hash;
        }

        const annualResult: ChainResult = {
            total: annualClosures.length,
            verified: annualVerified,
            issues_found: annualIssues.length,
            issues: annualIssues.length > 0 ? annualIssues : undefined,
            integrity_ok: annualIssues.length === 0,
        };

        // ── 5. Audit event chain ──
        const auditEvents = await query<AuditRow>(
            isPg
                ? `SELECT id, event_type, entity_type, entity_id, user_name, device_id, detail, event_hash, previous_event_hash, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at FROM ${prefix}audit_events ORDER BY id ASC`
                : `SELECT id, event_type, entity_type, entity_id, user_name, device_id, detail, event_hash, previous_event_hash, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at FROM ${prefix}audit_events ORDER BY id ASC`
        );
        const auditIssues: ChainIssue[] = [];
        let expectedAuditPrev: string | null = null;
        let auditVerified = 0;

        for (const row of auditEvents) {
            if (row.previous_event_hash !== expectedAuditPrev) {
                auditIssues.push({
                    id: row.id,
                    issue: `Chain break: stored previous="${row.previous_event_hash?.slice(0, 16) ?? 'null'}..." but expected="${expectedAuditPrev?.slice(0, 16) ?? 'null'}..."`,
                    stored_hash: row.event_hash,
                    computed_hash: '',
                });
            }
            const computed = recomputeAuditEventHash(row, row.previous_event_hash);
            if (row.event_hash !== computed) {
                auditIssues.push({
                    id: row.id,
                    issue: `Hash mismatch: stored="${row.event_hash}" but computed="${computed}"`,
                    stored_hash: row.event_hash,
                    computed_hash: computed,
                });
            } else {
                auditVerified++;
            }
            expectedAuditPrev = row.event_hash;
        }

        const auditResult: ChainResult = {
            total: auditEvents.length,
            verified: auditVerified,
            issues_found: auditIssues.length,
            issues: auditIssues.length > 0 ? auditIssues : undefined,
            integrity_ok: auditIssues.length === 0,
        };

        // ── Aggregate result ──
        const allOk =
            txResult.integrity_ok &&
            dailyResult.integrity_ok &&
            monthlyResult.integrity_ok &&
            annualResult.integrity_ok &&
            auditResult.integrity_ok;

        return NextResponse.json(
            {
                // Backward-compatible fields (existing UI expects these)
                total_transactions: txResult.total,
                verified: txResult.verified,
                issues_found: txIssues.length,
                issues: txIssues.length > 0 ? txIssues : undefined,
                integrity_ok: allOk,
                // New per-chain results
                chains: {
                    transactions: txResult,
                    daily_closures: dailyResult,
                    monthly_closures: monthlyResult,
                    annual_closures: annualResult,
                    audit_events: auditResult,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Error verifying integrity:', error);
        return NextResponse.json({ error: 'An error occurred while verifying integrity' }, { status: 500 });
    } finally {
        if (pgClient) pgClient.release();
        await connection?.end();
    }
}
