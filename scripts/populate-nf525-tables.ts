/**
 * Populate NF525 closure tables (daily_closures, monthly_closures,
 * annual_closures, perpetual_totals) from existing transaction data.
 *
 * This script is meant to be run once after:
 *   1. migrate-nf525-postgres.sql (creates the tables)
 *   2. generate-transaction-hashes.ts (populates transaction hashes)
 *
 * It computes daily totals from the transactions table, generates chained
 * hashes for each daily closure, then aggregates monthly and annual closures
 * from the daily closures, and finally populates the perpetual totals.
 *
 * The `audit_events` table is NOT populated by this script — only closure data.
 *
 * Usage:
 *   bun run scripts/populate-nf525-tables.ts            # apply changes
 *   bun run scripts/populate-nf525-tables.ts --dry-run  # preview only
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { createHash } from 'crypto';

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Must match the EXCLUDED_METHODS list in dailyClosure/route.ts
const EXCLUDED_METHODS = [
    'EFFACÉE',
    'ANNULÉE',
    'SUPPRIMÉE',
    'EN_ATTENTE',
    'EN_COURS',
    'MODIFICATION',
];

const CANCEL_METHODS = ['EFFACÉE', 'ANNULÉE', 'SUPPRIMÉE'];
const REFUND_METHOD = 'AVOIR';

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

interface PeriodTotals {
    ticket_count: number;
    total_amount: number;
    total_ht: number;
    total_tva: number;
    daily_closure_count?: number;
    monthly_closure_count?: number;
}

function generateDailyClosureHash(date: string, totals: DailyTotals, previousHash: string | null): string {
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

function generatePeriodClosureHash(period: string, totals: PeriodTotals, previousHash: string | null): string {
    const data = [
        previousHash || '',
        period,
        totals.ticket_count,
        totals.total_amount,
        totals.total_ht,
        totals.total_tva,
        totals.daily_closure_count ?? totals.monthly_closure_count ?? 0,
    ].join('|');
    return createHash('sha256').update(data).digest('hex');
}

async function populateNf525Tables() {
    const isDryRun = process.argv.includes('--dry-run');

    if (!process.env.PG_HOST || !process.env.PG_USER || !process.env.PG_PASSWORD) {
        log('❌ ERROR: Database connection parameters not found in environment', 'red');
        log('Please add PG_HOST, PG_USER, and PG_PASSWORD to your .env.local file', 'yellow');
        process.exit(1);
    }

    const config = {
        host: process.env.PG_HOST,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.NEXT_PUBLIC_SHOP_ID || process.env.PG_DATABASE || 'neondb',
        ssl: { rejectUnauthorized: false },
    };

    log('🔌 Connecting to PostgreSQL...', 'blue');
    const pool = new Pool(config);

    try {
        const client = await pool.connect();
        log('✅ Connected to PostgreSQL', 'green');

        await client.query('SET search_path TO dc_pos, dc, dc_sys, public');

        if (isDryRun) log('\n🧪 DRY RUN — no changes will be written\n', 'yellow');

        // ── Check for existing closures ──
        const { rows: existingDaily } = await client.query('SELECT COUNT(*)::int AS count FROM daily_closures');
        const { rows: existingMonthly } = await client.query('SELECT COUNT(*)::int AS count FROM monthly_closures');
        const { rows: existingAnnual } = await client.query('SELECT COUNT(*)::int AS count FROM annual_closures');

        if ((existingDaily[0]?.count ?? 0) > 0 || (existingMonthly[0]?.count ?? 0) > 0 || (existingAnnual[0]?.count ?? 0) > 0) {
            log('⚠️  Closure tables already contain data:', 'yellow');
            log(`  daily_closures: ${existingDaily[0]?.count ?? 0} rows`, 'yellow');
            log(`  monthly_closures: ${existingMonthly[0]?.count ?? 0} rows`, 'yellow');
            log(`  annual_closures: ${existingAnnual[0]?.count ?? 0} rows`, 'yellow');
            log('Aborting to prevent duplicates. Clear the tables first if you want to re-run.', 'red');
            client.release();
            await pool.end();
            process.exit(1);
        }

        // ── 1. Get all distinct transaction dates ──
        const { rows: dateRows } = await client.query(
            'SELECT DISTINCT DATE(created_at) AS tx_date FROM transactions ORDER BY tx_date ASC'
        );
        const dates = dateRows.map((r) => r.tx_date as string);

        log(`📊 Found ${dates.length} distinct transaction date(s)`, 'blue');

        if (dates.length === 0) {
            log('No transactions found. Nothing to populate.', 'yellow');
            client.release();
            await pool.end();
            return;
        }

        // ── 2. Compute and insert daily closures ──
        log('\n📅 Processing daily closures...', 'blue');

        const excludedPlaceholders = EXCLUDED_METHODS.map((_, i) => `$${i + 2}`).join(', ');
        const cancelPlaceholders = CANCEL_METHODS.map((_, i) => `$${i + 2}`).join(', ');

        let previousDailyHash: string | null = null;
        const dailyClosuresByDate: Map<string, DailyTotals & { hash: string }> = new Map();

        for (const date of dates) {
            // Paid transactions
            const { rows: paidRows } = await client.query(
                `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0)::numeric AS total ` +
                `FROM transactions WHERE DATE(created_at) = $1 AND payment_method NOT IN (${excludedPlaceholders})`,
                [date, ...EXCLUDED_METHODS]
            );
            const paid = paidRows[0];

            // Cancellations
            const { rows: cancelRows } = await client.query(
                `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(ABS(amount)), 0)::numeric AS total ` +
                `FROM transactions WHERE DATE(created_at) = $1 AND payment_method IN (${cancelPlaceholders})`,
                [date, ...CANCEL_METHODS]
            );
            const cancel = cancelRows[0];

            // Refunds
            const { rows: refundRows } = await client.query(
                `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(ABS(amount)), 0)::numeric AS total ` +
                `FROM transactions WHERE DATE(created_at) = $1 AND payment_method = $2`,
                [date, REFUND_METHOD]
            );
            const refund = refundRows[0];

            // HT and TVA from transaction_items
            const { rows: vatRows } = await client.query(
                `SELECT COALESCE(SUM(ti.total * ti.vat_rate / 100), 0)::numeric AS tva, ` +
                `COALESCE(SUM(ti.total), 0)::numeric AS ht ` +
                `FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id ` +
                `WHERE DATE(t.created_at) = $1 AND t.payment_method NOT IN (${excludedPlaceholders})`,
                [date, ...EXCLUDED_METHODS]
            );
            const vat = vatRows[0];

            const totals: DailyTotals = {
                ticket_count: Number(paid.cnt) || 0,
                total_amount: Number(paid.total) || 0,
                total_ht: Number(vat.ht) || 0,
                total_tva: Number(vat.tva) || 0,
                cancellation_count: Number(cancel.cnt) || 0,
                cancellation_amount: Number(cancel.total) || 0,
                refund_count: Number(refund.cnt) || 0,
                refund_amount: Number(refund.total) || 0,
            };

            const closureHash = generateDailyClosureHash(date, totals, previousDailyHash);
            dailyClosuresByDate.set(date, { ...totals, hash: closureHash });

            if (!isDryRun) {
                await client.query(
                    `INSERT INTO daily_closures ` +
                    `(closure_date, ticket_count, total_amount, total_ht, total_tva, ` +
                    `cancellation_count, cancellation_amount, refund_count, refund_amount, ` +
                    `closure_hash, previous_closure_hash, closed_by) ` +
                    `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
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
                        previousDailyHash,
                        'migration-script',
                    ]
                );
            }

            previousDailyHash = closureHash;

            if (isDryRun) {
                log(`  [dry-run] ${date}: tickets=${totals.ticket_count} total=${totals.total_amount} hash=${closureHash.slice(0, 16)}...`, 'yellow');
            }
        }

        log(`  ${isDryRun ? '🧪 Would insert' : '✅ Inserted'} ${dates.length} daily closure(s)`, 'green');

        // ── 3. Aggregate and insert monthly closures ──
        log('\n📆 Processing monthly closures...', 'blue');

        // Group daily closures by month
        const monthlyMap: Map<string, DailyTotals[]> = new Map();
        for (const [date, totals] of dailyClosuresByDate) {
            const monthKey = date.substring(0, 7); // YYYY-MM
            if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, []);
            monthlyMap.get(monthKey)!.push(totals);
        }

        const sortedMonths = [...monthlyMap.keys()].sort();
        let previousMonthlyHash: string | null = null;
        let monthlyCount = 0;

        for (const monthKey of sortedMonths) {
            const monthTotalsList = monthlyMap.get(monthKey)!;
            const monthDate = `${monthKey}-01`;

            const totals: PeriodTotals = {
                daily_closure_count: monthTotalsList.length,
                ticket_count: monthTotalsList.reduce((s, t) => s + t.ticket_count, 0),
                total_amount: monthTotalsList.reduce((s, t) => s + t.total_amount, 0),
                total_ht: monthTotalsList.reduce((s, t) => s + t.total_ht, 0),
                total_tva: monthTotalsList.reduce((s, t) => s + t.total_tva, 0),
            };

            const closureHash = generatePeriodClosureHash(monthDate, totals, previousMonthlyHash);

            if (!isDryRun) {
                await client.query(
                    `INSERT INTO monthly_closures ` +
                    `(closure_month, daily_closure_count, ticket_count, total_amount, total_ht, total_tva, ` +
                    `closure_hash, previous_closure_hash, closed_by) ` +
                    `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        monthDate,
                        totals.daily_closure_count,
                        totals.ticket_count,
                        totals.total_amount,
                        totals.total_ht,
                        totals.total_tva,
                        closureHash,
                        previousMonthlyHash,
                        'migration-script',
                    ]
                );
            }

            if (isDryRun) {
                log(`  [dry-run] ${monthKey}: dailies=${totals.daily_closure_count} tickets=${totals.ticket_count} total=${totals.total_amount} hash=${closureHash.slice(0, 16)}...`, 'yellow');
            }

            previousMonthlyHash = closureHash;
            monthlyCount++;
        }

        log(`  ${isDryRun ? '🧪 Would insert' : '✅ Inserted'} ${monthlyCount} monthly closure(s)`, 'green');

        // ── 4. Aggregate and insert annual closures ──
        log('\n📊 Processing annual closures...', 'blue');

        // Group monthly closures by year
        const annualMap: Map<number, PeriodTotals[]> = new Map();
        for (const monthKey of sortedMonths) {
            const year = parseInt(monthKey.substring(0, 4), 10);
            const monthTotalsList = monthlyMap.get(monthKey)!;
            if (!annualMap.has(year)) annualMap.set(year, []);
            annualMap.get(year)!.push({
                ticket_count: monthTotalsList.reduce((s, t) => s + t.ticket_count, 0),
                total_amount: monthTotalsList.reduce((s, t) => s + t.total_amount, 0),
                total_ht: monthTotalsList.reduce((s, t) => s + t.total_ht, 0),
                total_tva: monthTotalsList.reduce((s, t) => s + t.total_tva, 0),
                daily_closure_count: monthTotalsList.length,
            });
        }

        const sortedYears = [...annualMap.keys()].sort((a, b) => a - b);
        let previousAnnualHash: string | null = null;
        let annualCount = 0;

        for (const year of sortedYears) {
            const yearTotalsList = annualMap.get(year)!;
            const totals: PeriodTotals = {
                monthly_closure_count: yearTotalsList.length,
                ticket_count: yearTotalsList.reduce((s, t) => s + t.ticket_count, 0),
                total_amount: yearTotalsList.reduce((s, t) => s + t.total_amount, 0),
                total_ht: yearTotalsList.reduce((s, t) => s + t.total_ht, 0),
                total_tva: yearTotalsList.reduce((s, t) => s + t.total_tva, 0),
            };

            const closureHash = generatePeriodClosureHash(String(year), totals, previousAnnualHash);

            if (!isDryRun) {
                await client.query(
                    `INSERT INTO annual_closures ` +
                    `(closure_year, monthly_closure_count, ticket_count, total_amount, total_ht, total_tva, ` +
                    `closure_hash, previous_closure_hash, closed_by) ` +
                    `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        year,
                        totals.monthly_closure_count,
                        totals.ticket_count,
                        totals.total_amount,
                        totals.total_ht,
                        totals.total_tva,
                        closureHash,
                        previousAnnualHash,
                        'migration-script',
                    ]
                );
            }

            if (isDryRun) {
                log(`  [dry-run] ${year}: monthlies=${totals.monthly_closure_count} tickets=${totals.ticket_count} total=${totals.total_amount} hash=${closureHash.slice(0, 16)}...`, 'yellow');
            }

            previousAnnualHash = closureHash;
            annualCount++;
        }

        log(`  ${isDryRun ? '🧪 Would insert' : '✅ Inserted'} ${annualCount} annual closure(s)`, 'green');

        // ── 5. Populate perpetual totals ──
        log('\n♾️  Processing perpetual totals...', 'blue');

        const allDailyTotals = [...dailyClosuresByDate.values()];
        const perpetual = {
            total_ticket_count: allDailyTotals.reduce((s, t) => s + t.ticket_count, 0),
            total_amount: allDailyTotals.reduce((s, t) => s + t.total_amount, 0),
            total_ht: allDailyTotals.reduce((s, t) => s + t.total_ht, 0),
            total_tva: allDailyTotals.reduce((s, t) => s + t.total_tva, 0),
            total_cancellation_count: allDailyTotals.reduce((s, t) => s + t.cancellation_count, 0),
            total_refund_count: allDailyTotals.reduce((s, t) => s + t.refund_count, 0),
            last_closure_hash: previousDailyHash,
        };

        if (isDryRun) {
            log(`  [dry-run] tickets=${perpetual.total_ticket_count} total=${perpetual.total_amount} last_hash=${perpetual.last_closure_hash?.slice(0, 16) ?? 'null'}...`, 'yellow');
        } else {
            await client.query(
                `INSERT INTO perpetual_totals ` +
                `(id, total_ticket_count, total_amount, total_ht, total_tva, ` +
                `total_cancellation_count, total_refund_count, last_closure_hash, updated_at) ` +
                `VALUES (1, $1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
                [
                    perpetual.total_ticket_count,
                    perpetual.total_amount,
                    perpetual.total_ht,
                    perpetual.total_tva,
                    perpetual.total_cancellation_count,
                    perpetual.total_refund_count,
                    perpetual.last_closure_hash,
                ]
            );
            log('  ✅ Inserted perpetual totals', 'green');
        }

        // ── Summary ──
        log(`\n${isDryRun ? '🧪 Summary (dry run)' : '✨ Summary'}`, 'green');
        log(`  Daily closures:   ${dates.length}`, 'blue');
        log(`  Monthly closures: ${monthlyCount}`, 'blue');
        log(`  Annual closures:  ${annualCount}`, 'blue');
        log(`  Perpetual totals: 1 row`, 'blue');

        client.release();
        await pool.end();
        log('\n✨ Done!', 'green');
    } catch (error) {
        log('\n❌ Script failed:', 'red');
        console.error(error);
        await pool.end();
        process.exit(1);
    }
}

populateNf525Tables();
