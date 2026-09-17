import { getShopIdFromRequest } from '@/app/constants/shop';
import { assertDeviceAuthorized } from '../deviceAuth';
import { NextResponse } from 'next/server';
import { dayBounds, getPosDb, type DbConnection } from '../db';
import { createHash } from 'crypto';
import {
    DELETED_KEYWORD,
    CANCELLED_KEYWORD,
    EXPUNGED_KEYWORD,
    REFUND_KEYWORD,
    UPDATING_KEYWORD,
    PROCESSING_KEYWORD,
    WAITING_KEYWORD,
    DEFAULT_VAT_RATE,
} from '@/app/utils/constants';
import { insertAuditEvent, lockHashChain } from '../auditHelpers';
import { rechainFrom } from '../hashChain';

export const dynamic = 'force-dynamic';

const EXCLUDED_METHODS = [
    DELETED_KEYWORD,
    CANCELLED_KEYWORD,
    EXPUNGED_KEYWORD,
    UPDATING_KEYWORD,
    PROCESSING_KEYWORD,
    WAITING_KEYWORD,
];

// Unpaid in-progress rows — never finalizable once their day is sealed.
const DRAFT_METHODS = [PROCESSING_KEYWORD, WAITING_KEYWORD, UPDATING_KEYWORD];

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
    const placeholders = EXCLUDED_METHODS.map((_, i) => (isPg ? `$${i + 3}` : '?')).join(', ');
    const [dayStart, dayEnd] = dayBounds(date);

    // Paid transactions (exclude non-paid methods) — immutable calendar day (00:00 to 24:00)
    const paidQuery = `SELECT COUNT(*)${isPg ? '::int' : ''} AS cnt, COALESCE(ROUND(SUM(amount), 2), 0)${isPg ? '::numeric' : ''} AS total FROM ${prefix}transactions WHERE created_at >= ${isPg ? '$1' : '?'} AND created_at < ${isPg ? '$2' : '?'} AND payment_method NOT IN (${placeholders})`;

    const paidParams = [dayStart, dayEnd, ...EXCLUDED_METHODS];
    const [paidRows] = await connection.execute(paidQuery, paidParams);
    const paidResult = (paidRows as { cnt: number; total: number | string }[])[0];

    // Cancellations and deletions
    const cancelMethods = [DELETED_KEYWORD, CANCELLED_KEYWORD, EXPUNGED_KEYWORD];
    const cancelPlaceholders = cancelMethods.map((_, i) => (isPg ? `$${i + 3}` : '?')).join(', ');
    const cancelQuery = `SELECT COUNT(*)${isPg ? '::int' : ''} AS cnt, COALESCE(ROUND(SUM(ABS(amount)), 2), 0)${isPg ? '::numeric' : ''} AS total FROM ${prefix}transactions WHERE created_at >= ${isPg ? '$1' : '?'} AND created_at < ${isPg ? '$2' : '?'} AND payment_method IN (${cancelPlaceholders})`;
    const cancelParams = [dayStart, dayEnd, ...cancelMethods];
    const [cancelRows] = await connection.execute(cancelQuery, cancelParams);
    const cancelResult = (cancelRows as { cnt: number; total: number | string }[])[0];

    // Refunds
    const refundQuery = `SELECT COUNT(*)${isPg ? '::int' : ''} AS cnt, COALESCE(ROUND(SUM(ABS(amount)), 2), 0)${isPg ? '::numeric' : ''} AS total FROM ${prefix}transactions WHERE created_at >= ${isPg ? '$1' : '?'} AND created_at < ${isPg ? '$2' : '?'} AND payment_method = ${isPg ? '$3' : '?'}`;
    const [refundRows] = await connection.execute(refundQuery, [dayStart, dayEnd, REFUND_KEYWORD]);
    const refundResult = (refundRows as { cnt: number; total: number | string }[])[0];

    const totalAmount = Number(paidResult.total) || 0;
    // HT and TVA computed from transaction_items joined with transactions.
    // ti.total is TTC (items sum to the paid amount): HT = TTC/(1+rate),
    // TVA = TTC*rate/(100+rate) — same convention as posPrinter/billingStats.
    const vatQuery = `SELECT COALESCE(ROUND(SUM(ti.total * COALESCE(ti.vat_rate, ${DEFAULT_VAT_RATE}) / (100 + COALESCE(ti.vat_rate, ${DEFAULT_VAT_RATE}))), 2), 0)${isPg ? '::numeric' : ''} AS tva, COALESCE(ROUND(SUM(ti.total * 100 / (100 + COALESCE(ti.vat_rate, ${DEFAULT_VAT_RATE}))), 2), 0)${isPg ? '::numeric' : ''} AS ht FROM ${prefix}transaction_items ti JOIN ${prefix}transactions t ON t.id = ti.transaction_id WHERE t.created_at >= ${isPg ? '$1' : '?'} AND t.created_at < ${isPg ? '$2' : '?'} AND t.payment_method NOT IN (${placeholders})`;
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

// Anchor the closure to the transaction chain (NF525 P2.9): the hash covers the
// first and last paid transaction of the day, so modifying any transaction of
// the day (hashes are chained and rechained on update) breaks the closure.
async function getDayTransactionAnchors(
    connection: DbConnection,
    date: string
): Promise<{ first: string; last: string }> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const placeholders = EXCLUDED_METHODS.map((_, i) => (isPg ? `$${i + 3}` : '?')).join(', ');
    const params = [...dayBounds(date), ...EXCLUDED_METHODS];
    const base =
        `SELECT hash FROM ${prefix}transactions WHERE created_at >= ${isPg ? '$1' : '?'} AND created_at < ${isPg ? '$2' : '?'}` +
        ` AND payment_method NOT IN (${placeholders}) ORDER BY id`;
    const [firstRows] = await connection.execute(`${base} ASC LIMIT 1`, params);
    const [lastRows] = await connection.execute(`${base} DESC LIMIT 1`, params);
    return {
        first: (firstRows as { hash: string | null }[])[0]?.hash ?? '',
        last: (lastRows as { hash: string | null }[])[0]?.hash ?? '',
    };
}

// Money columns are NUMERIC(14,2) — hash the value as stored (rounded to
// cents), not the full-precision aggregate, or verification would mismatch.
const round2 = (v: number) => Math.round(v * 100) / 100;

function generateClosureHash(
    date: string,
    totals: DailyTotals,
    previousHash: string | null,
    firstTxHash: string,
    lastTxHash: string
): string {
    const data = [
        previousHash || '',
        date,
        totals.ticket_count,
        round2(totals.total_amount),
        round2(totals.total_ht),
        round2(totals.total_tva),
        totals.cancellation_count,
        round2(totals.cancellation_amount),
        totals.refund_count,
        round2(totals.refund_amount),
        firstTxHash,
        lastTxHash,
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
    let unlockTx: (() => Promise<void>) | undefined;
    let unlockDaily: (() => Promise<void>) | undefined;
    let unlockPeriod: (() => Promise<void>) | undefined;
    try {
        const { date, closed_by, auto, redate_to } = (await request.json()) as {
            date: string;
            closed_by: string;
            auto?: boolean;
            // Local datetime drafts are moved to — every created_at in the DB
            // is client-local, so CURRENT_TIMESTAMP (UTC) could strand a draft
            // on the wrong calendar day near midnight.
            redate_to?: string;
        };

        if (!date || !closed_by) {
            return NextResponse.json({ error: 'date and closed_by are required' }, { status: 400 });
        }
        // The date string goes verbatim into the closure hash — anything the DB
        // would normalize (e.g. '2025-3-5' → '2025-03-05') would mismatch on
        // verification. Require the canonical format.
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json({ error: 'date must be in YYYY-MM-DD format' }, { status: 400 });
        }
        // A closure can only seal a fully elapsed day: a future-dated closure
        // would reject every sale dated there, permanently (append-only).
        // Auto-closures only target days before the last reset boundary, so
        // "today" is already too late for them. Manual closes of the current
        // day stay allowed — the Z-ticket legitimately ends the business day.
        const today = new Date().toISOString().slice(0, 10);
        if (auto ? date >= today : date > today) {
            return NextResponse.json(
                {
                    error: `Impossible de clôturer la journée du ${date} — elle n'est pas terminée`,
                    code: 'FUTURE_DATE',
                },
                { status: 400 }
            );
        }

        connection = await getPosDb(shopId);
        const deviceGuard = await assertDeviceAuthorized(request, shopId, undefined, connection);
        if (deviceGuard) return deviceGuard;
        await connection.beginTransaction();
        // Lock order must match saveTransaction/periodClosure everywhere:
        // transactions < daily_closures < period_closures.
        // nf525_transactions serializes the anchor/totals reads below with
        // transaction writes — otherwise a sale could commit between the
        // anchor computation and this insert, sealing a stale hash.
        // nf525_daily_closures serializes closure writers (tail-hash read).
        // nf525_period_closures serializes the monthly-seal check below with
        // monthly closure inserts.
        // The transaction chain can legitimately be held for several seconds
        // by a writer rechaining the tail — a closure is rare and explicit,
        // so a longer wait beats a hard 10 s failure.
        unlockTx = await lockHashChain(connection, 'nf525_transactions', 30_000);
        unlockDaily = await lockHashChain(connection, 'nf525_daily_closures');
        unlockPeriod = await lockHashChain(connection, 'nf525_period_closures');

        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';

        // Check if closure already exists for this date
        const checkQuery = isPg
            ? `SELECT id FROM ${prefix}daily_closures WHERE closure_date = $1`
            : `SELECT id FROM ${prefix}daily_closures WHERE closure_date = ?`;
        const [existing] = await connection.execute(checkQuery, [date]);
        if ((existing as { id: number }[]).length > 0) {
            await connection.rollback();
            // Auto-closures race across open devices/tabs: the first commits and
            // the rest hit this branch. Report it as success (idempotent) so the
            // console isn't flooded with expected 409s; manual closes keep the
            // 409 so the cashier sees the refusal. Still traced server-side —
            // a wrongly-created closure (e.g. the premature-seal bug) would
            // otherwise become silent.
            if (auto) console.warn(`[dailyClosure] auto-close hit existing closure for ${date} — idempotent`);
            return NextResponse.json(
                { error: 'Closure already exists for this date', code: 'ALREADY_CLOSED', closedDay: date },
                { status: auto ? 200 : 409 }
            );
        }

        // Same seal rule one level up: a monthly closure anchors its month's
        // daily-closure hashes (and the recorded month totals), so adding a
        // daily closure inside a sealed month/year would falsify the anchor —
        // refuse it. Only a fully elapsed period can be legitimately sealed:
        // a monthly/annual closure of the in-progress period is bogus data
        // and must not block this closure.
        const serverToday = new Date().toISOString().slice(0, 10);
        const monthElapsed = date.slice(0, 7) < serverToday.slice(0, 7);
        const yearElapsed = Number(date.slice(0, 4)) < Number(serverToday.slice(0, 4));
        const monthDate = `${date.slice(0, 7)}-01`;
        const [sealedMonth] = monthElapsed
            ? await connection.execute(
                  isPg
                      ? `SELECT id FROM ${prefix}monthly_closures WHERE closure_month = $1`
                      : `SELECT id FROM ${prefix}monthly_closures WHERE closure_month = ?`,
                  [monthDate]
              )
            : [[]];
        if ((sealedMonth as { id: number }[]).length > 0) {
            await connection.rollback();
            // Same as ALREADY_CLOSED: terminal and expected for auto-closure —
            // but an unclosed day inside a sealed month is a chain gap, so it
            // stays traced server-side.
            if (auto)
                console.warn(`[dailyClosure] auto-close ${date} skipped — month ${date.slice(0, 7)} already sealed`);
            return NextResponse.json(
                {
                    error: `Le mois ${date.slice(0, 7)} est clôturé — la journée ne peut plus être clôturée`,
                    code: 'PERIOD_SEALED',
                    closedDay: date,
                },
                { status: auto ? 200 : 409 }
            );
        }
        const [sealedYear] = yearElapsed
            ? await connection.execute(
                  isPg
                      ? `SELECT id FROM ${prefix}annual_closures WHERE closure_year = $1`
                      : `SELECT id FROM ${prefix}annual_closures WHERE closure_year = ?`,
                  [Number(date.slice(0, 4))]
              )
            : [[]];
        if ((sealedYear as { id: number }[]).length > 0) {
            await connection.rollback();
            if (auto)
                console.warn(`[dailyClosure] auto-close ${date} skipped — year ${date.slice(0, 4)} already sealed`);
            return NextResponse.json(
                {
                    error: `L'année ${date.slice(0, 4)} est clôturée — la journée ne peut plus être clôturée`,
                    code: 'PERIOD_SEALED',
                    closedDay: date,
                },
                { status: auto ? 200 : 409 }
            );
        }

        // Unpaid drafts (EN COURS / EN ATTENTE / EN MODIF) dated this day
        // could never be finalized afterwards — the sealed-day guard rejects
        // their write and they vanish from sync.
        //
        // - Manual closure: refuse with PENDING_DRAFTS — the cashier must
        //   collect or cancel them first.
        // - Automatic closure (closingHour): nobody is there to collect them,
        //   so re-date every draft dated on/before this day to NOW — the cart
        //   stays alive on the new open day (the hash is recomputed via
        //   rechainFrom; an audit event traces the move). A draft whose rechain
        //   would reach an already-sealed day stays put and still blocks below.
        //
        // The check runs under nf525_transactions, so no draft can slip in
        // concurrently.
        const draftPlaceholders = DRAFT_METHODS.map((_, i) => (isPg ? `$${i + 2}` : '?')).join(', ');

        if (auto) {
            // The destination day must be open — a skewed client clock could
            // otherwise strand a draft on a sealed day (unwritable, hidden
            // from sync) or push it far into the future (invisible until
            // then). Compute the first open day after `date` and only accept
            // the client's timestamp when its day is open and within a sane
            // window; otherwise fall back to that first open day.
            const [closedAfter] = await connection.execute(
                `SELECT ${isPg ? "to_char(closure_date, 'YYYY-MM-DD')" : "DATE_FORMAT(closure_date, '%Y-%m-%d')"} AS d FROM ${prefix}daily_closures WHERE closure_date > ${isPg ? '$1::date' : '?'}`,
                [date]
            );
            const closedAfterSet = new Set((closedAfter as { d: string }[]).map((r) => r.d));
            const addDays = (day: string, n: number): string => {
                const dt = new Date(`${day}T00:00:00Z`);
                dt.setUTCDate(dt.getUTCDate() + n);
                return dt.toISOString().slice(0, 10);
            };
            let openDay = addDays(date, 1);
            while (closedAfterSet.has(openDay)) openDay = addDays(openDay, 1);
            const maxDay = addDays(serverToday > openDay ? serverToday : openDay, 1);

            const validTs = redate_to && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(redate_to) ? redate_to : null;
            const clientDay = validTs ? validTs.slice(0, 10) : '';
            const targetDay =
                clientDay > date && clientDay <= maxDay && !closedAfterSet.has(clientDay) ? clientDay : openDay;
            const target = `${targetDay} ${validTs ? validTs.slice(11) : '00:00:00'}`;

            const [drafts] = await connection.execute(
                `SELECT id, order_id FROM ${prefix}transactions WHERE created_at < ${isPg ? '$1::date' : '?'} AND payment_method IN (${draftPlaceholders}) ORDER BY id`,
                [dayBounds(date)[1], ...DRAFT_METHODS]
            );
            const movedIds: number[] = [];
            for (const draft of drafts as { id: number; order_id: string }[]) {
                // Rechaining rewrites hash/previous_hash on every later row —
                // refuse to move a draft when any row after it sits in a
                // sealed day (its anchored hash would be rewritten).
                const [conflict] = await connection.execute(
                    `SELECT 1 FROM ${prefix}transactions t JOIN ${prefix}daily_closures c ON t.created_at >= c.closure_date AND t.created_at < (c.closure_date + ${isPg ? '1' : 'INTERVAL 1 DAY'}) WHERE t.id >= ${isPg ? '$1' : '?'} LIMIT 1`,
                    [draft.id]
                );
                if ((conflict as unknown[]).length > 0) continue;

                await connection.execute(
                    `UPDATE ${prefix}transactions SET created_at = ${isPg ? '$1' : '?'}, updated_at = ${isPg ? '$2' : '?'} WHERE id = ${isPg ? '$3' : '?'}`,
                    [target, target, draft.id]
                );
                movedIds.push(draft.id);
                await insertAuditEvent(connection, {
                    event_type: 'transaction_redated',
                    entity_type: 'transaction',
                    entity_id: draft.order_id,
                    user_name: closed_by,
                    detail: `auto-closure of ${date}: draft moved to ${targetDay}`,
                });
            }
            // One rechain from the earliest moved row — re-dating N drafts in
            // a loop would otherwise rewrite the whole chain tail N times.
            if (movedIds.length > 0) {
                await rechainFrom(connection, Math.min(...movedIds));
            }
        }

        const [draftRows] = await connection.execute(
            `SELECT COUNT(*) AS cnt FROM ${prefix}transactions WHERE created_at >= ${isPg ? '$1' : '?'} AND created_at < ${isPg ? '$2' : '?'} AND payment_method IN (${draftPlaceholders})`,
            [...dayBounds(date), ...DRAFT_METHODS]
        );
        const draftCount = Number((draftRows as { cnt: number | string }[])[0]?.cnt) || 0;
        if (draftCount > 0) {
            await connection.rollback();
            return NextResponse.json(
                {
                    error: `${draftCount} transaction(s) en cours ou en attente datée(s) du ${date} — encaissez-les ou annulez-les avant de clôturer`,
                    code: 'PENDING_DRAFTS',
                    draftCount,
                },
                { status: 409 }
            );
        }

        // Compute totals — immutable calendar day (00:00 to 24:00) for audit integrity
        const totals = await computeDailyTotals(connection, date);

        // Generate chained hash — anchored to the day's transaction chain
        const previousHash = await getLatestDailyClosureHash(connection);
        const anchors = await getDayTransactionAnchors(connection, date);
        const closureHash = generateClosureHash(date, totals, previousHash, anchors.first, anchors.last);

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
        // Release in reverse acquisition order (advisory anyway — the locks
        // die with the connection regardless).
        for (const unlock of [unlockPeriod, unlockDaily, unlockTx]) {
            try {
                await unlock?.();
            } catch {
                // lock release failure — the lock dies with the connection anyway
            }
        }
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
        const deviceGuard = await assertDeviceAuthorized(request, shopId, undefined, connection);
        if (deviceGuard) return deviceGuard;
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
