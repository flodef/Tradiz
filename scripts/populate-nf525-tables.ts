/**
 * Populate NF525 closure tables from existing transaction data.
 *
 * ⚠️  GUARD: If closure tables already contain data, the script refuses to run
 * unless --force-rechain is passed. A typed confirmation is required and a
 * chain_rebuild audit event is logged capturing the previous state.
 *
 * Usage: bun run scripts/populate-nf525-tables.ts [--dry-run] [--force-rechain]
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import * as readline from 'readline';

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', reset: '\x1b[0m' };
function log(m: string, c: keyof typeof C = 'reset') {
    console.log(`${C[c]}${m}${C.reset}`);
}
function prompt(q: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((r) =>
        rl.question(q, (a) => {
            rl.close();
            r(a.trim());
        })
    );
}

const EXCLUDED = ['EFFACÉE', 'ANNULÉE', 'SUPPRIMÉE', 'EN ATTENTE', 'EN COURS', 'EN MODIF'];
const CANCEL = ['EFFACÉE', 'ANNULÉE', 'SUPPRIMÉE'];
const REFUND = 'REMBOURSEMENT';

// pg parses DATE columns into Date objects at local midnight — toISOString()
// would shift the day back by the UTC offset. Format with local components.
function dateStr(v: unknown): string {
    if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return String(v).slice(0, 10);
}

interface Daily {
    ticket_count: number;
    total_amount: number;
    total_ht: number;
    total_tva: number;
    cancellation_count: number;
    cancellation_amount: number;
    refund_count: number;
    refund_amount: number;
}
interface Period {
    ticket_count: number;
    total_amount: number;
    total_ht: number;
    total_tva: number;
    daily_closure_count?: number;
    monthly_closure_count?: number;
}

// Money columns are NUMERIC(14,2) — hash the value as stored (rounded to
// cents), not the full-precision JS sum, or verification would mismatch.
const round2 = (v: number) => Math.round(v * 100) / 100;

function dailyHash(date: string, t: Daily, prev: string | null, firstTx: string, lastTx: string): string {
    return createHash('sha256')
        .update(
            [
                prev || '',
                date,
                t.ticket_count,
                round2(t.total_amount),
                round2(t.total_ht),
                round2(t.total_tva),
                t.cancellation_count,
                round2(t.cancellation_amount),
                t.refund_count,
                round2(t.refund_amount),
                firstTx,
                lastTx,
            ].join('|')
        )
        .digest('hex');
}
function periodHash(p: string, t: Period, prev: string | null, firstChild: string, lastChild: string): string {
    return createHash('sha256')
        .update(
            [
                prev || '',
                p,
                t.ticket_count,
                round2(t.total_amount),
                round2(t.total_ht),
                round2(t.total_tva),
                t.daily_closure_count ?? t.monthly_closure_count ?? 0,
                firstChild,
                lastChild,
            ].join('|')
        )
        .digest('hex');
}

async function main() {
    const isDry = process.argv.includes('--dry-run');
    const isForceRechain = process.argv.includes('--force-rechain');
    if (!process.env.PG_HOST || !process.env.PG_USER || !process.env.PG_PASSWORD) {
        log('❌ Missing DB env', 'red');
        process.exit(1);
    }
    const pool = new Pool({
        host: process.env.PG_HOST,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.NEXT_PUBLIC_SHOP_ID || process.env.PG_DATABASE || 'neondb',
        ssl: { rejectUnauthorized: false },
    });
    log('🔌 Connecting...', 'blue');
    try {
        const db = await pool.connect();
        log('✅ Connected', 'green');
        await db.query('SET search_path TO dc_pos, dc, dc_sys, public');
        if (isDry) log('\n🧪 DRY RUN\n', 'yellow');

        // Check existing
        const [{ rows: eD }, { rows: eM }, { rows: eA }] = await Promise.all([
            db.query('SELECT COUNT(*)::int AS c FROM daily_closures'),
            db.query('SELECT COUNT(*)::int AS c FROM monthly_closures'),
            db.query('SELECT COUNT(*)::int AS c FROM annual_closures'),
        ]);
        if ((eD[0]?.c ?? 0) > 0 || (eM[0]?.c ?? 0) > 0 || (eA[0]?.c ?? 0) > 0) {
            log('⚠️  Tables already contain data:', 'yellow');
            log(`  daily: ${eD[0]?.c ?? 0}, monthly: ${eM[0]?.c ?? 0}, annual: ${eA[0]?.c ?? 0}`, 'yellow');
            if (!isForceRechain) {
                log('❌ Refusing to overwrite existing closure data.', 'red');
                log('   Repopulating closures overwrites the existing chain and can mask tampering.', 'red');
                log('   Use --force-rechain. A typed confirmation will be required', 'yellow');
                log('   and a chain_rebuild audit event will be logged.', 'yellow');
                db.release();
                await pool.end();
                process.exit(1);
            }
            if (isDry) {
                log('🧪 DRY RUN: would prompt for confirmation and clear + repopulate.', 'yellow');
            } else {
                const confirmation = await prompt(
                    'Type "RECHAIN" to confirm you want to clear and repopulate all closure tables: '
                );
                if (confirmation !== 'RECHAIN') {
                    log('Aborted — confirmation did not match "RECHAIN".', 'red');
                    db.release();
                    await pool.end();
                    process.exit(0);
                }

                // Log the chain_rebuild audit event
                const operator = process.env.USER || process.env.USERNAME || 'unknown';
                const auditDetail = JSON.stringify({
                    previous_counts: {
                        daily: eD[0]?.c ?? 0,
                        monthly: eM[0]?.c ?? 0,
                        annual: eA[0]?.c ?? 0,
                    },
                    operator,
                    reason: 'force-rechain via populate-nf525-tables.ts',
                });
                await db.query(
                    `INSERT INTO audit_events (event_type, entity_type, entity_id, user_name, detail)
                     VALUES ('chain_rebuild', 'closures', 'all', $1, $2)`,
                    [operator, auditDetail]
                );
                log('📝 Logged chain_rebuild audit event.', 'blue');
            }
            if (!isDry) {
                log('🗑️  Clearing...', 'blue');
                // TRUNCATE + repopulation run inside one transaction: in PG a
                // TRUNCATE is transactional, so a failure mid-way rolls back
                // instead of leaving the closure tables empty.
                await db.query('BEGIN');
                try {
                    await db.query(
                        'TRUNCATE daily_closures, monthly_closures, annual_closures, perpetual_totals RESTART IDENTITY CASCADE'
                    );
                } catch (e) {
                    await db.query('ROLLBACK');
                    throw e;
                }
            }
        }

        let txOpen = !isDry && (eD[0]?.c ?? 0) + (eM[0]?.c ?? 0) + (eA[0]?.c ?? 0) > 0;

        // 1. Single query for all daily totals
        log('\n📅 Fetching daily totals...', 'blue');
        const exL = EXCLUDED.map((m) => `'${m.replace(/'/g, "''")}'`).join(', ');
        const caL = CANCEL.map((m) => `'${m.replace(/'/g, "''")}'`).join(', ');
        const { rows: dr } = await db.query(
            `WITH paid AS (SELECT DATE(created_at) d, COUNT(*)::int tc, COALESCE(SUM(amount),0)::numeric ta FROM transactions WHERE payment_method NOT IN (${exL}) GROUP BY 1),
            canc AS (SELECT DATE(created_at) d, COUNT(*)::int cc, COALESCE(SUM(ABS(amount)),0)::numeric ca FROM transactions WHERE payment_method IN (${caL}) GROUP BY 1),
            refs AS (SELECT DATE(created_at) d, COUNT(*)::int rc, COALESCE(SUM(ABS(amount)),0)::numeric ra FROM transactions WHERE payment_method='${REFUND}' GROUP BY 1),
            htva AS (SELECT DATE(t.created_at) d, COALESCE(SUM(ti.total),0)::numeric ht, COALESCE(SUM(ti.total*ti.vat_rate/100),0)::numeric tva FROM transaction_items ti JOIN transactions t ON t.id=ti.transaction_id WHERE t.payment_method NOT IN (${exL}) GROUP BY 1)
            SELECT COALESCE(paid.d,canc.d,refs.d,htva.d) AS dt, COALESCE(paid.tc,0) tc, COALESCE(paid.ta,0) ta, COALESCE(htva.ht,0) ht, COALESCE(htva.tva,0) tva, COALESCE(canc.cc,0) cc, COALESCE(canc.ca,0) ca, COALESCE(refs.rc,0) rc, COALESCE(refs.ra,0) ra
            FROM paid FULL OUTER JOIN canc ON paid.d=canc.d FULL OUTER JOIN refs ON COALESCE(paid.d,canc.d)=refs.d FULL OUTER JOIN htva ON COALESCE(paid.d,canc.d,refs.d)=htva.d ORDER BY 1`
        );
        log(`📊 Found ${dr.length} distinct date(s)`, 'blue');

        // Anchors (P2.9): first/last paid transaction hash per day — binds each
        // daily closure to the transaction chain it seals.
        const { rows: anchorRows } = await db.query(
            `SELECT id, hash, DATE(created_at) AS d FROM transactions WHERE payment_method NOT IN (${exL}) ORDER BY id`
        );
        const txAnchors = new Map<string, { first: string; last: string }>();
        for (const r of anchorRows) {
            const d = dateStr(r.d);
            const a = txAnchors.get(d);
            if (a) a.last = r.hash ?? '';
            else txAnchors.set(d, { first: r.hash ?? '', last: r.hash ?? '' });
        }

        if (!dr.length) {
            log('Nothing to populate.', 'yellow');
            db.release();
            await pool.end();
            return;
        }

        // 2. Compute daily hashes in JS
        let prevD: string | null = null;
        const byDate = new Map<string, Daily & { hash: string }>();
        const dailyIns: { d: string; t: Daily; h: string; p: string | null }[] = [];
        for (let i = 0; i < dr.length; i++) {
            const r = dr[i];
            const date = dateStr(r.dt);
            const t: Daily = {
                ticket_count: Number(r.tc) || 0,
                total_amount: Number(r.ta) || 0,
                total_ht: Number(r.ht) || 0,
                total_tva: Number(r.tva) || 0,
                cancellation_count: Number(r.cc) || 0,
                cancellation_amount: Number(r.ca) || 0,
                refund_count: Number(r.rc) || 0,
                refund_amount: Number(r.ra) || 0,
            };
            const a = txAnchors.get(date) ?? { first: '', last: '' };
            const h = dailyHash(date, t, prevD, a.first, a.last);
            byDate.set(date, { ...t, hash: h });
            dailyIns.push({ d: date, t, h, p: prevD });
            prevD = h;
            if (isDry)
                log(`  [dry] ${date}: tk=${t.ticket_count} total=${t.total_amount} h=${h.slice(0, 16)}...`, 'yellow');
            else if ((i + 1) % 100 === 0 || i === dr.length - 1) log(`  Computed ${i + 1}/${dr.length}...`, 'blue');
        }

        // Batch insert daily
        if (!isDry) {
            const B = 100;
            for (let i = 0; i < dailyIns.length; i += B) {
                const b = dailyIns.slice(i, i + B);
                await db.query(
                    `INSERT INTO daily_closures (closure_date, ticket_count, total_amount, total_ht, total_tva, cancellation_count, cancellation_amount, refund_count, refund_amount, closure_hash, previous_closure_hash, closed_by)
                    SELECT v.d, v.tc, v.ta, v.ht, v.tva, v.cc, v.ca, v.rc, v.ra, v.h, v.ph, v.cb
                    FROM unnest($1::date[], $2::int[], $3::numeric[], $4::numeric[], $5::numeric[], $6::int[], $7::numeric[], $8::int[], $9::numeric[], $10::text[], $11::text[], $12::text[]) AS v(d, tc, ta, ht, tva, cc, ca, rc, ra, h, ph, cb)`,
                    [
                        b.map((x) => x.d),
                        b.map((x) => x.t.ticket_count),
                        b.map((x) => x.t.total_amount),
                        b.map((x) => x.t.total_ht),
                        b.map((x) => x.t.total_tva),
                        b.map((x) => x.t.cancellation_count),
                        b.map((x) => x.t.cancellation_amount),
                        b.map((x) => x.t.refund_count),
                        b.map((x) => x.t.refund_amount),
                        b.map((x) => x.h),
                        b.map((x) => x.p),
                        b.map(() => 'migration-script'),
                    ]
                );
            }
        }
        log(`  ${isDry ? '🧪 Would insert' : '✅ Inserted'} ${dr.length} daily closure(s)`, 'green');

        // 3. Monthly closures
        log('\n📆 Processing monthly closures...', 'blue');
        const mMap = new Map<string, (Daily & { hash: string })[]>();
        const monthHashByMk = new Map<string, string>();
        for (const [date, t] of byDate) {
            const mk = date.substring(0, 7);
            if (!mMap.has(mk)) mMap.set(mk, []);
            mMap.get(mk)!.push(t);
        }
        const sortedM = [...mMap.keys()].sort();
        let prevM: string | null = null;
        let mc = 0;
        const mIns: {
            md: string;
            dc: number;
            tc: number;
            ta: number;
            ht: number;
            tva: number;
            h: string;
            p: string | null;
        }[] = [];
        for (const mk of sortedM) {
            const ml = mMap.get(mk)!;
            const pt: Period = {
                daily_closure_count: ml.length,
                ticket_count: ml.reduce((s, t) => s + t.ticket_count, 0),
                total_amount: ml.reduce((s, t) => s + t.total_amount, 0),
                total_ht: ml.reduce((s, t) => s + t.total_ht, 0),
                total_tva: ml.reduce((s, t) => s + t.total_tva, 0),
            };
            // Anchor: first/last daily closure hash of the month (P2.9).
            // `ml` is ordered by date since `byDate` iterates dr (ORDER BY date).
            const h = periodHash(`${mk}-01`, pt, prevM, ml[0].hash, ml[ml.length - 1].hash);
            monthHashByMk.set(mk, h);
            if (!isDry)
                mIns.push({
                    md: `${mk}-01`,
                    dc: pt.daily_closure_count!,
                    tc: pt.ticket_count,
                    ta: pt.total_amount,
                    ht: pt.total_ht,
                    tva: pt.total_tva,
                    h,
                    p: prevM,
                });
            if (isDry)
                log(
                    `  [dry] ${mk}: dailies=${pt.daily_closure_count} tk=${pt.ticket_count} total=${pt.total_amount} h=${h.slice(0, 16)}...`,
                    'yellow'
                );
            prevM = h;
            mc++;
        }
        if (!isDry && mIns.length) {
            await db.query(
                `INSERT INTO monthly_closures (closure_month, daily_closure_count, ticket_count, total_amount, total_ht, total_tva, closure_hash, previous_closure_hash, closed_by)
                SELECT v.m, v.dc, v.tc, v.ta, v.ht, v.tva, v.h, v.ph, v.cb
                FROM unnest($1::date[], $2::int[], $3::int[], $4::numeric[], $5::numeric[], $6::numeric[], $7::text[], $8::text[], $9::text[]) AS v(m, dc, tc, ta, ht, tva, h, ph, cb)`,
                [
                    mIns.map((x) => x.md),
                    mIns.map((x) => x.dc),
                    mIns.map((x) => x.tc),
                    mIns.map((x) => x.ta),
                    mIns.map((x) => x.ht),
                    mIns.map((x) => x.tva),
                    mIns.map((x) => x.h),
                    mIns.map((x) => x.p),
                    mIns.map(() => 'migration-script'),
                ]
            );
        }
        log(`  ${isDry ? '🧪 Would insert' : '✅ Inserted'} ${mc} monthly closure(s)`, 'green');

        // 4. Annual closures
        log('\n📊 Processing annual closures...', 'blue');
        const aMap = new Map<number, Period[]>();
        for (const mk of sortedM) {
            const y = parseInt(mk.substring(0, 4), 10);
            const ml = mMap.get(mk)!;
            if (!aMap.has(y)) aMap.set(y, []);
            aMap.get(y)!.push({
                ticket_count: ml.reduce((s, t) => s + t.ticket_count, 0),
                total_amount: ml.reduce((s, t) => s + t.total_amount, 0),
                total_ht: ml.reduce((s, t) => s + t.total_ht, 0),
                total_tva: ml.reduce((s, t) => s + t.total_tva, 0),
                daily_closure_count: ml.length,
            });
        }
        const sortedY = [...aMap.keys()].sort((a, b) => a - b);
        let prevA: string | null = null;
        let ac = 0;
        const aIns: {
            y: number;
            mc: number;
            tc: number;
            ta: number;
            ht: number;
            tva: number;
            h: string;
            p: string | null;
        }[] = [];
        for (const y of sortedY) {
            const yl = aMap.get(y)!;
            const pt: Period = {
                monthly_closure_count: yl.length,
                ticket_count: yl.reduce((s, t) => s + t.ticket_count, 0),
                total_amount: yl.reduce((s, t) => s + t.total_amount, 0),
                total_ht: yl.reduce((s, t) => s + t.total_ht, 0),
                total_tva: yl.reduce((s, t) => s + t.total_tva, 0),
            };
            // Anchor: first/last monthly closure hash of the year (P2.9).
            const yMonths = sortedM.filter((mk) => parseInt(mk.substring(0, 4), 10) === y);
            const firstM = monthHashByMk.get(yMonths[0]) ?? '';
            const lastM = monthHashByMk.get(yMonths[yMonths.length - 1]) ?? '';
            const h = periodHash(String(y), pt, prevA, firstM, lastM);
            if (!isDry)
                aIns.push({
                    y,
                    mc: pt.monthly_closure_count!,
                    tc: pt.ticket_count,
                    ta: pt.total_amount,
                    ht: pt.total_ht,
                    tva: pt.total_tva,
                    h,
                    p: prevA,
                });
            if (isDry)
                log(
                    `  [dry] ${y}: monthlies=${pt.monthly_closure_count} tk=${pt.ticket_count} total=${pt.total_amount} h=${h.slice(0, 16)}...`,
                    'yellow'
                );
            prevA = h;
            ac++;
        }
        if (!isDry && aIns.length) {
            await db.query(
                `INSERT INTO annual_closures (closure_year, monthly_closure_count, ticket_count, total_amount, total_ht, total_tva, closure_hash, previous_closure_hash, closed_by)
                SELECT v.y, v.mc, v.tc, v.ta, v.ht, v.tva, v.h, v.ph, v.cb
                FROM unnest($1::int[], $2::int[], $3::int[], $4::numeric[], $5::numeric[], $6::numeric[], $7::text[], $8::text[], $9::text[]) AS v(y, mc, tc, ta, ht, tva, h, ph, cb)`,
                [
                    aIns.map((x) => x.y),
                    aIns.map((x) => x.mc),
                    aIns.map((x) => x.tc),
                    aIns.map((x) => x.ta),
                    aIns.map((x) => x.ht),
                    aIns.map((x) => x.tva),
                    aIns.map((x) => x.h),
                    aIns.map((x) => x.p),
                    aIns.map(() => 'migration-script'),
                ]
            );
        }
        log(`  ${isDry ? '🧪 Would insert' : '✅ Inserted'} ${ac} annual closure(s)`, 'green');

        // 5. Perpetual totals
        log('\n♾️  Processing perpetual totals...', 'blue');
        const all = [...byDate.values()];
        const perp = {
            tc: all.reduce((s, t) => s + t.ticket_count, 0),
            ta: all.reduce((s, t) => s + t.total_amount, 0),
            ht: all.reduce((s, t) => s + t.total_ht, 0),
            tva: all.reduce((s, t) => s + t.total_tva, 0),
            cc: all.reduce((s, t) => s + t.cancellation_count, 0),
            rc: all.reduce((s, t) => s + t.refund_count, 0),
            lh: prevD,
        };
        if (isDry) {
            log(`  [dry] tk=${perp.tc} total=${perp.ta} last_hash=${perp.lh?.slice(0, 16) ?? 'null'}...`, 'yellow');
        } else {
            await db.query(
                `INSERT INTO perpetual_totals (id, total_ticket_count, total_amount, total_ht, total_tva, total_cancellation_count, total_refund_count, last_closure_hash, updated_at) VALUES (1, $1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
                [perp.tc, perp.ta, perp.ht, perp.tva, perp.cc, perp.rc, perp.lh]
            );
            log('  ✅ Inserted perpetual totals', 'green');
        }

        if (txOpen) {
            await db.query('COMMIT');
            txOpen = false;
        }

        // Summary
        log(`\n${isDry ? '🧪 Summary (dry run)' : '✨ Summary'}`, 'green');
        log(`  Daily closures:   ${dr.length}`, 'blue');
        log(`  Monthly closures: ${mc}`, 'blue');
        log(`  Annual closures:  ${ac}`, 'blue');
        log(`  Perpetual totals: 1 row`, 'blue');

        db.release();
        await pool.end();
        log('\n✨ Done!', 'green');
    } catch (error) {
        log('\n❌ Script failed:', 'red');
        console.error(error);
        if (txOpen) {
            try {
                await db.query('ROLLBACK');
                log('↩️  Rolled back — closure tables left untouched.', 'yellow');
            } catch {
                // rollback itself failed; nothing more to do
            }
        }
        await pool.end();
        process.exit(1);
    }
}

main();
