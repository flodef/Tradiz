/**
 * Generate chained hashes (hash + previous_hash) for all existing transactions.
 *
 * This script is meant to be run once after applying the NF525 migration
 * (migrate-nf525-postgres.sql) to populate the `hash` and `previous_hash`
 * columns for transactions that were created before NF525 compliance was
 * implemented.
 *
 * The hash chain is ordered by transaction `id` (insertion order), which
 * matches the logic in saveTransaction/route.ts where getLatestHash fetches
 * the most recent row by `ORDER BY id DESC`.
 *
 * Usage:
 *   bun run scripts/generate-transaction-hashes.ts            # apply changes
 *   bun run scripts/generate-transaction-hashes.ts --dry-run  # preview only
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

interface TransactionRow {
    id: number;
    order_id: string;
    user_name: string;
    payment_method: string;
    amount: number | string;
    currency: string;
    change: number | string | null;
    device_id: string | null;
    created_at: string;
}

function generateTransactionHash(
    tx: TransactionRow,
    transactionId: number,
    previousHash: string | null
): string {
    const data = [
        previousHash || '',
        transactionId,
        tx.order_id,
        tx.user_name,
        tx.payment_method,
        tx.amount,
        tx.currency,
        tx.created_at,
        tx.change || '',
        tx.device_id || '',
    ].join('|');

    return createHash('sha256').update(data).digest('hex');
}

async function generateTransactionHashes() {
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

        // Fetch all transactions ordered by id (chain order)
        const { rows } = await client.query(
            'SELECT id, order_id, user_name, payment_method, amount, currency, change, device_id, created_at ' +
            'FROM transactions ORDER BY id ASC'
        );
        const transactions = rows as TransactionRow[];

        log(`📊 Found ${transactions.length} transaction(s) to process`, 'blue');

        if (transactions.length === 0) {
            log('No transactions to hash. Exiting.', 'yellow');
            client.release();
            await pool.end();
            return;
        }

        // Count how many already have a hash
        const { rows: existingHashRows } = await client.query(
            'SELECT COUNT(*)::int AS count FROM transactions WHERE hash IS NOT NULL'
        );
        const existingCount = existingHashRows[0]?.count ?? 0;
        if (existingCount > 0) {
            log(`⚠️  ${existingCount} transaction(s) already have a hash. They will be recalculated.`, 'yellow');
        }

        let previousHash: string | null = null;
        let processed = 0;

        for (const tx of transactions) {
            const hash = generateTransactionHash(tx, tx.id, previousHash);

            if (isDryRun) {
                if (processed < 5 || processed === transactions.length - 1) {
                    log(`  [dry-run] tx id=${tx.id} hash=${hash.slice(0, 16)}... prev=${previousHash?.slice(0, 16) ?? 'null'}...`, 'yellow');
                } else if (processed === 5) {
                    log(`  ... (suppressing remaining dry-run output)`, 'yellow');
                }
            } else {
                await client.query(
                    'UPDATE transactions SET hash = $1, previous_hash = $2 WHERE id = $3',
                    [hash, previousHash, tx.id]
                );
            }

            previousHash = hash;
            processed++;

            if (processed % 100 === 0) {
                log(`  Processed ${processed}/${transactions.length}...`, 'blue');
            }
        }

        log(
            `\n${isDryRun ? '🧪 Would hash' : '✨ Hashed'} ${processed} transaction(s).`,
            'green'
        );

        if (!isDryRun) {
            // Verify chain integrity
            const { rows: verifyRows } = await client.query(
                'SELECT id, hash, previous_hash FROM transactions ORDER BY id ASC'
            );
            let broken = 0;
            let prev: string | null = null;
            for (const row of verifyRows) {
                if (row.previous_hash !== prev) {
                    broken++;
                    log(`  ⚠️  Chain break at id=${row.id}: expected prev=${prev?.slice(0, 16) ?? 'null'}..., got=${row.previous_hash?.slice(0, 16) ?? 'null'}...`, 'red');
                }
                prev = row.hash;
            }
            if (broken === 0) {
                log('✅ Chain integrity verified — all previous_hash values match preceding hash.', 'green');
            } else {
                log(`❌ ${broken} chain break(s) detected!`, 'red');
            }
        }

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

generateTransactionHashes();
