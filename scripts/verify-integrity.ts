/**
 * Verify NF525 transaction hash integrity directly against the database.
 *
 * Replicates the logic from /api/sql/verifyIntegrity/route.ts without
 * needing to run the Next.js app.
 *
 * Usage:
 *   bun run scripts/verify-integrity.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { createHash } from 'crypto';

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    dim: '\x1b[2m',
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
    created_at: string;
    change: string | null;
    device_id: string | null;
    hash: string | null;
    previous_hash: string | null;
}

interface IntegrityIssue {
    transaction_id: number;
    order_id: string;
    issue: string;
    stored_hash: string | null;
    computed_hash: string;
}

function recomputeHash(transactionId: number | string, tx: TransactionRow, previousHash: string | null): string {
    const data = [
        previousHash || '',
        transactionId || 'new',
        tx.order_id,
        tx.user_name,
        tx.payment_method,
        String(Number(tx.amount)),
        tx.currency,
        String(tx.created_at),
        tx.change || '',
        tx.device_id || '',
    ].join('|');
    return createHash('sha256').update(data).digest('hex');
}

async function main() {
    if (!process.env.PG_HOST || !process.env.PG_USER || !process.env.PG_PASSWORD) {
        log('❌ Missing DB env (PG_HOST, PG_USER, PG_PASSWORD)', 'red');
        process.exit(1);
    }

    const database = process.env.NEXT_PUBLIC_SHOP_ID || process.env.PG_DATABASE || 'neondb';
    const pool = new Pool({
        host: process.env.PG_HOST,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database,
        ssl: { rejectUnauthorized: false },
    });

    log('🔌 Connecting to PostgreSQL...', 'blue');
    try {
        const client = await pool.connect();
        log('✅ Connected', 'green');
        await client.query('SET search_path TO dc_pos, dc, dc_sys, public');

        log('\n🔍 Fetching all transactions...', 'blue');
        const { rows } = await client.query(
            'SELECT id, order_id, user_name, payment_method, amount, currency, ' +
                "to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at, " +
                'change, device_id, hash, previous_hash FROM transactions ORDER BY id ASC'
        );
        const transactions = rows as TransactionRow[];

        log(`📊 Found ${transactions.length} transaction(s)`, 'blue');

        if (transactions.length === 0) {
            log('No transactions to verify.', 'yellow');
            client.release();
            await pool.end();
            return;
        }

        const issues: IntegrityIssue[] = [];
        let expectedPreviousHash: string | null = null;
        let verifiedCount = 0;
        let chainBreaks = 0;
        let hashMismatches = 0;

        for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];

            // Check previous_hash chain integrity
            if (tx.previous_hash !== expectedPreviousHash) {
                chainBreaks++;
                issues.push({
                    transaction_id: tx.id,
                    order_id: tx.order_id,
                    issue: `Chain break: stored previous_hash="${tx.previous_hash?.slice(0, 16) ?? 'null'}..." but expected="${expectedPreviousHash?.slice(0, 16) ?? 'null'}..."`,
                    stored_hash: tx.hash,
                    computed_hash: '',
                });
            }

            // Recompute hash and compare
            const computedHash = recomputeHash(tx.id, tx, tx.previous_hash);
            if (tx.hash !== computedHash) {
                hashMismatches++;
                issues.push({
                    transaction_id: tx.id,
                    order_id: tx.order_id,
                    issue: `Hash mismatch: stored="${tx.hash?.slice(0, 16) ?? 'null'}..." but computed="${computedHash.slice(0, 16)}..."`,
                    stored_hash: tx.hash,
                    computed_hash: computedHash,
                });
            } else {
                verifiedCount++;
            }

            // Move chain forward
            expectedPreviousHash = tx.hash;

            if ((i + 1) % 5000 === 0) {
                log(`  Checked ${i + 1}/${transactions.length}...`, 'dim');
            }
        }

        // Summary
        log(`\n${'═'.repeat(50)}`, 'reset');
        if (issues.length === 0) {
            log('✅ INTEGRITY OK — all hashes verified', 'green');
        } else {
            log(`❌ INTEGRITY FAIL — ${issues.length} issue(s) found`, 'red');
        }
        log(`  Total transactions: ${transactions.length}`, 'blue');
        log(`  Verified:           ${verifiedCount}`, 'green');
        log(`  Chain breaks:       ${chainBreaks}`, chainBreaks > 0 ? 'red' : 'blue');
        log(`  Hash mismatches:    ${hashMismatches}`, hashMismatches > 0 ? 'red' : 'blue');

        // Show debug info for first mismatched transaction
        const firstMismatch = issues.find((i) => i.computed_hash);
        if (firstMismatch) {
            const tx = transactions.find((t) => t.id === firstMismatch.transaction_id);
            if (tx) {
                log(`\n🔬 Debug — first mismatched transaction (id=${tx.id}):`, 'yellow');
                log(`  order_id:      ${tx.order_id}`, 'dim');
                log(`  user_name:     ${tx.user_name}`, 'dim');
                log(`  payment_method:${tx.payment_method}`, 'dim');
                log(
                    `  amount (raw):  ${tx.amount} → Number: ${Number(tx.amount)} → String: ${String(Number(tx.amount))}`,
                    'dim'
                );
                log(`  currency:      ${tx.currency}`, 'dim');
                log(`  created_at:    "${tx.created_at}"`, 'dim');
                log(`  change:        "${tx.change ?? 'null'}"`, 'dim');
                log(`  device_id:     "${tx.device_id ?? 'null'}"`, 'dim');
                log(`  stored hash:   ${tx.hash}`, 'dim');
                log(`  computed hash: ${firstMismatch.computed_hash}`, 'dim');
                const hashInput = [
                    tx.previous_hash || '',
                    tx.id,
                    tx.order_id,
                    tx.user_name,
                    tx.payment_method,
                    String(Number(tx.amount)),
                    tx.currency,
                    String(tx.created_at),
                    tx.change || '',
                    tx.device_id || '',
                ].join('|');
                log(`  hash input:    ${hashInput}`, 'dim');
            }
        }

        // Show first 20 issues for debugging
        if (issues.length > 0) {
            log(`\n📋 First ${Math.min(20, issues.length)} issue(s):`, 'yellow');
            for (const issue of issues.slice(0, 20)) {
                log(`  [id=${issue.transaction_id}] ${issue.issue}`, 'red');
                if (issue.computed_hash) {
                    log(`    full computed: ${issue.computed_hash}`, 'dim');
                    log(`    full stored:   ${issue.stored_hash ?? 'null'}`, 'dim');
                }
            }
            if (issues.length > 20) {
                log(`  ... and ${issues.length - 20} more`, 'dim');
            }
        }

        client.release();
        await pool.end();
        log('\n✨ Done!', 'green');
        process.exit(issues.length > 0 ? 1 : 0);
    } catch (error) {
        log('\n❌ Script failed:', 'red');
        console.error(error);
        await pool.end();
        process.exit(1);
    }
}

main();
