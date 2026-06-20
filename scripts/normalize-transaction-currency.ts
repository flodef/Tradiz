/**
 * Normalize the `currency` column in dc_pos.transactions.
 *
 * Historically transactions stored the currency as the legacy "Label (Symbol)"
 * format (e.g. "Euro (€)") or sometimes just the symbol ("€"). The app now uses
 * the currency *label* only (e.g. "Euro"), which matches the `currencies` table.
 *
 * This script rewrites every transaction currency to the matching label, so the
 * data is consistent with what new transactions store.
 *
 * Usage:
 *   bun run scripts/normalize-transaction-currency.ts            # apply changes
 *   bun run scripts/normalize-transaction-currency.ts --dry-run  # preview only
 */

import 'dotenv/config';
import { Pool } from 'pg';

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

interface CurrencyRow {
    label: string;
    symbol: string;
}

async function normalizeTransactionCurrency() {
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
        ssl: { rejectUnauthorized: false }, // Required for Neon
    };

    log('🔌 Connecting to PostgreSQL...', 'blue');
    const pool = new Pool(config);

    try {
        const client = await pool.connect();
        log('✅ Connected to PostgreSQL', 'green');

        // Use the same search_path as the app so unqualified table names resolve.
        await client.query('SET search_path TO dc_pos, dc, dc_sys, public');

        if (isDryRun) log('\n🧪 DRY RUN — no changes will be written\n', 'yellow');

        // Load currencies (label + symbol)
        const { rows: currencyRows } = await client.query('SELECT label, symbol FROM currencies');
        const currencies = currencyRows as CurrencyRow[];
        if (!currencies.length) {
            log('❌ No currencies found in the `currencies` table — aborting.', 'red');
            client.release();
            await pool.end();
            process.exit(1);
        }
        log(`📊 Loaded ${currencies.length} currency definition(s): ${currencies.map((c) => c.label).join(', ')}`, 'blue');

        // Show current distribution of currency values in transactions
        const { rows: beforeRows } = await client.query(
            'SELECT currency, COUNT(*)::int AS count FROM transactions GROUP BY currency ORDER BY count DESC'
        );
        log('\n🔍 Current currency values in transactions:', 'blue');
        beforeRows.forEach((r) => log(`  - "${r.currency}": ${r.count}`));

        // For each currency, rewrite legacy variants ("Label (Symbol)" or bare "Symbol") to the label.
        let totalUpdated = 0;
        for (const { label, symbol } of currencies) {
            const legacyVariants = [`${label} (${symbol})`, symbol].filter((v) => v && v !== label);
            if (!legacyVariants.length) continue;

            if (isDryRun) {
                const { rows } = await client.query(
                    'SELECT COUNT(*)::int AS count FROM transactions WHERE currency = ANY($1)',
                    [legacyVariants]
                );
                const count = rows[0]?.count ?? 0;
                if (count) {
                    log(`  → would update ${count} row(s) [${legacyVariants.join(', ')}] → "${label}"`, 'yellow');
                    totalUpdated += count;
                }
            } else {
                const result = await client.query(
                    'UPDATE transactions SET currency = $1 WHERE currency = ANY($2)',
                    [label, legacyVariants]
                );
                const count = result.rowCount ?? 0;
                if (count) {
                    log(`  ✅ updated ${count} row(s) [${legacyVariants.join(', ')}] → "${label}"`, 'green');
                    totalUpdated += count;
                }
            }
        }

        if (!isDryRun) {
            // Show resulting distribution
            const { rows: afterRows } = await client.query(
                'SELECT currency, COUNT(*)::int AS count FROM transactions GROUP BY currency ORDER BY count DESC'
            );
            log('\n🔍 Resulting currency values in transactions:', 'blue');
            afterRows.forEach((r) => log(`  - "${r.currency}": ${r.count}`));
        }

        log(`\n${isDryRun ? '🧪 Would update' : '✨ Updated'} ${totalUpdated} transaction(s).`, 'green');

        client.release();
        await pool.end();
        log('\n✨ Done!', 'green');
    } catch (error) {
        log('\n❌ Migration failed:', 'red');
        console.error(error);
        await pool.end();
        process.exit(1);
    }
}

normalizeTransactionCurrency();
