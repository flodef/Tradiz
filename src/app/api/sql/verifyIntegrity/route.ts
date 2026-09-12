import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { getPosPgDb, isPgConfigured } from '../pg-db';
import { computeTransactionHash, type TransactionItemHashInput } from '@/app/utils/transactionHash';
import { parsePaymentLegs } from '@/app/utils/transactionNote';
import {
    DELETED_KEYWORD,
    CANCELLED_KEYWORD,
    EXPUNGED_KEYWORD,
    UPDATING_KEYWORD,
    PROCESSING_KEYWORD,
    WAITING_KEYWORD,
    USE_DIGICARTE,
} from '@/app/utils/constants';
import { createHash } from 'crypto';

// Same exclusion set as dailyClosure: the daily anchor covers paid transactions.
const EXCLUDED_METHODS = new Set([
    DELETED_KEYWORD,
    CANCELLED_KEYWORD,
    EXPUNGED_KEYWORD,
    UPDATING_KEYWORD,
    PROCESSING_KEYWORD,
    WAITING_KEYWORD,
]);

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

// Normalize a DATE column to 'YYYY-MM-DD' — pg returns strings, mysql2 returns
// Date objects at local midnight (toISOString would shift the day back).
function normalizeDate(value: unknown): string {
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return String(value ?? '').slice(0, 10);
}

// Money columns are NUMERIC(14,2) — canonicalize to cents so the recomputed
// hash matches what was stored, regardless of the source precision.
const round2 = (v: number) => Math.round(v * 100) / 100;

function recomputeDailyClosureHash(
    row: ClosureRow,
    previousHash: string | null,
    firstTxHash: string,
    lastTxHash: string
): string {
    const data = [
        previousHash || '',
        normalizeDate(row.closure_date),
        String(row.ticket_count ?? 0),
        String(round2(Number(row.total_amount ?? 0))),
        String(round2(Number(row.total_ht ?? 0))),
        String(round2(Number(row.total_tva ?? 0))),
        String(row.cancellation_count ?? 0),
        String(round2(Number(row.cancellation_amount ?? 0))),
        String(row.refund_count ?? 0),
        String(round2(Number(row.refund_amount ?? 0))),
        firstTxHash,
        lastTxHash,
    ].join('|');
    return createHash('sha256').update(data).digest('hex');
}

function recomputePeriodClosureHash(
    row: ClosureRow,
    previousHash: string | null,
    firstChildHash: string,
    lastChildHash: string
): string {
    const period = row.closure_month != null ? normalizeDate(row.closure_month) : String(row.closure_year ?? '');
    const data = [
        previousHash || '',
        period,
        String(row.ticket_count ?? 0),
        String(round2(Number(row.total_amount ?? 0))),
        String(round2(Number(row.total_ht ?? 0))),
        String(round2(Number(row.total_tva ?? 0))),
        String(row.daily_closure_count ?? row.monthly_closure_count ?? 0),
        firstChildHash,
        lastChildHash,
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
        // Must mirror getPosDb: when DigiCarte is enabled the closures live in
        // MariaDB even though PG is configured.
        const isPg = !USE_DIGICARTE && isPgConfigured(shopId);
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
                : await (async () => {
                      // MariaDB: chunk the IN clause — an unfiltered SELECT of the
                      // whole items table is unbounded on large databases.
                      const all: TransactionItemRow[] = [];
                      const CHUNK = 500;
                      for (let i = 0; i < txIds.length; i += CHUNK) {
                          const chunk = txIds.slice(i, i + CHUNK);
                          const ph = chunk.map(() => '?').join(',');
                          const rows = await query<TransactionItemRow>(
                              'SELECT transaction_id, label, quantity, amount, total, vat_rate, discount_amount ' +
                                  `FROM transaction_items WHERE transaction_id IN (${ph}) ORDER BY transaction_id, id`,
                              chunk
                          );
                          all.push(...rows);
                      }
                      return all;
                  })();
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
                    issue: `Rupture de chaîne : hash précédent stocké "${tx.previous_hash?.slice(0, 16) ?? 'null'}…" mais attendu "${expectedPrevHash?.slice(0, 16) ?? 'null'}…"`,
                    stored_hash: tx.hash,
                    computed_hash: '',
                });
            }
            const items = itemsByTransaction.get(tx.id);
            const computedHash = recomputeHash(tx.id, tx, tx.previous_hash, items);
            if (tx.hash !== computedHash) {
                txIssues.push({
                    id: tx.id,
                    issue: `Hash invalide : stocké "${tx.hash}" mais calculé "${computedHash}"`,
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

        // Anchors (P2.9): first/last paid transaction hash per calendar day.
        // `transactions` is already ordered by id ASC — the hash-chain order.
        const txAnchors = new Map<string, { first: string; last: string }>();
        for (const tx of transactions) {
            if (EXCLUDED_METHODS.has(tx.payment_method)) continue;
            const day = String(tx.created_at).slice(0, 10);
            const a = txAnchors.get(day);
            const hash = tx.hash ?? '';
            if (a) a.last = hash;
            else txAnchors.set(day, { first: hash, last: hash });
        }

        const dailyIssues: ChainIssue[] = [];
        let expectedDailyPrev: string | null = null;
        let dailyVerified = 0;

        for (const row of dailyClosures) {
            if (row.previous_closure_hash !== expectedDailyPrev) {
                dailyIssues.push({
                    id: row.id,
                    issue: `Rupture de chaîne : hash précédent stocké "${row.previous_closure_hash?.slice(0, 16) ?? 'null'}…" mais attendu "${expectedDailyPrev?.slice(0, 16) ?? 'null'}…"`,
                    stored_hash: row.closure_hash,
                    computed_hash: '',
                });
            }
            const anchors = txAnchors.get(normalizeDate(row.closure_date)) ?? { first: '', last: '' };
            const computed = recomputeDailyClosureHash(row, row.previous_closure_hash, anchors.first, anchors.last);
            if (row.closure_hash !== computed) {
                dailyIssues.push({
                    id: row.id,
                    issue: `Hash invalide : stocké "${row.closure_hash}" mais calculé "${computed}"`,
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

        // Anchors (P2.9): first/last daily closure hash per month, ordered by
        // closure_date (the period order, not insertion order).
        const dailiesByMonth = new Map<string, { day: string; hash: string }[]>();
        for (const row of dailyClosures) {
            const day = normalizeDate(row.closure_date);
            const month = day.slice(0, 7);
            const list = dailiesByMonth.get(month) ?? [];
            list.push({ day, hash: String(row.closure_hash ?? '') });
            dailiesByMonth.set(month, list);
        }
        const dailyAnchors = new Map<string, { first: string; last: string }>();
        for (const [month, list] of dailiesByMonth) {
            list.sort((a, b) => a.day.localeCompare(b.day));
            dailyAnchors.set(month, { first: list[0].hash, last: list[list.length - 1].hash });
        }

        const monthlyIssues: ChainIssue[] = [];
        let expectedMonthlyPrev: string | null = null;
        let monthlyVerified = 0;

        for (const row of monthlyClosures) {
            if (row.previous_closure_hash !== expectedMonthlyPrev) {
                monthlyIssues.push({
                    id: row.id,
                    issue: `Rupture de chaîne : hash précédent stocké "${row.previous_closure_hash?.slice(0, 16) ?? 'null'}…" mais attendu "${expectedMonthlyPrev?.slice(0, 16) ?? 'null'}…"`,
                    stored_hash: row.closure_hash,
                    computed_hash: '',
                });
            }
            const anchors = dailyAnchors.get(normalizeDate(row.closure_month).slice(0, 7)) ?? {
                first: '',
                last: '',
            };
            const computed = recomputePeriodClosureHash(row, row.previous_closure_hash, anchors.first, anchors.last);
            if (row.closure_hash !== computed) {
                monthlyIssues.push({
                    id: row.id,
                    issue: `Hash invalide : stocké "${row.closure_hash}" mais calculé "${computed}"`,
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

        // Anchors (P2.9): first/last monthly closure hash per year.
        const monthliesByYear = new Map<string, { month: string; hash: string }[]>();
        for (const row of monthlyClosures) {
            const month = normalizeDate(row.closure_month).slice(0, 7);
            const year = month.slice(0, 4);
            const list = monthliesByYear.get(year) ?? [];
            list.push({ month, hash: String(row.closure_hash ?? '') });
            monthliesByYear.set(year, list);
        }
        const monthlyAnchors = new Map<string, { first: string; last: string }>();
        for (const [year, list] of monthliesByYear) {
            list.sort((a, b) => a.month.localeCompare(b.month));
            monthlyAnchors.set(year, { first: list[0].hash, last: list[list.length - 1].hash });
        }

        const annualIssues: ChainIssue[] = [];
        let expectedAnnualPrev: string | null = null;
        let annualVerified = 0;

        for (const row of annualClosures) {
            if (row.previous_closure_hash !== expectedAnnualPrev) {
                annualIssues.push({
                    id: row.id,
                    issue: `Rupture de chaîne : hash précédent stocké "${row.previous_closure_hash?.slice(0, 16) ?? 'null'}…" mais attendu "${expectedAnnualPrev?.slice(0, 16) ?? 'null'}…"`,
                    stored_hash: row.closure_hash,
                    computed_hash: '',
                });
            }
            const anchors = monthlyAnchors.get(String(row.closure_year ?? '')) ?? { first: '', last: '' };
            const computed = recomputePeriodClosureHash(row, row.previous_closure_hash, anchors.first, anchors.last);
            if (row.closure_hash !== computed) {
                annualIssues.push({
                    id: row.id,
                    issue: `Hash invalide : stocké "${row.closure_hash}" mais calculé "${computed}"`,
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
                    issue: `Rupture de chaîne : hash précédent stocké "${row.previous_event_hash?.slice(0, 16) ?? 'null'}…" mais attendu "${expectedAuditPrev?.slice(0, 16) ?? 'null'}…"`,
                    stored_hash: row.event_hash,
                    computed_hash: '',
                });
            }
            const computed = recomputeAuditEventHash(row, row.previous_event_hash);
            if (row.event_hash !== computed) {
                auditIssues.push({
                    id: row.id,
                    issue: `Hash invalide : stocké "${row.event_hash}" mais calculé "${computed}"`,
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
