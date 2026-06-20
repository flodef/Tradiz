/**
 * Firestore → PostgreSQL importer for Tradiz
 *
 * Imports transaction data into the PostgreSQL `transactions` + `transaction_items` tables.
 * Data can be fetched directly from Firestore or read from a JSON dump file.
 *
 * Usage:
 *   bun run scripts/firestore-to-postgres.ts                    (interactive mode)
 *   bun run scripts/firestore-to-postgres.ts --shop <shopname> [--dry-run] [--export <file.json>]
 *   bun run scripts/firestore-to-postgres.ts --file <path.json> [--dry-run]
 *
 * Options:
 *   --shop <name>       Fetch from Firestore for this shop
 *   --file <path>       Read from JSON file instead of Firestore
 *   --export <path>     Export to JSON file (don't import to DB)
 *   --dry-run           Preview without making changes
 *   --overwrite         Overwrite existing transactions
 *
 * Environment variables (or .env):
 *   PG_HOST     – PostgreSQL host     (default: localhost)
 *   PG_PORT     – PostgreSQL port     (default: 5432)
 *   PG_USER     – PostgreSQL user     (default: postgres)
 *   PG_PASSWORD – PostgreSQL password (default: empty)
 *   PG_DATABASE – PostgreSQL database (default: dc_pos)
 *
 *   For --shop mode (Firebase):
 *   GOOGLE_APPLICATION_CREDENTIALS – path to service account key JSON
 *   (or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)
 */

import 'dotenv/config';
import { createHash } from 'crypto';
import { Pool, type PoolClient } from 'pg';
import { fetchFromFirestore, loadFromFile } from './import/firestore';
import { parseArgs, PAYMENT_METHOD_MAP, SKIP_METHODS, msToDatetime } from './import/types';
import type { TransactionSet } from './import/types';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';

type PgPool = InstanceType<typeof Pool>;

interface TxWithMeta {
    tx: TransactionSet['transactions'][0];
    panierId: string;
    index: number;
}

interface CliConfig {
    mode: 'shop' | 'file';
    value: string;
    exportPath?: string;
    shouldImport: boolean;
    dryRun: boolean;
    overwrite: boolean;
}

// ── Configuration ────────────────────────────────────────────────────────────

// ── Interactive prompts ──────────────────────────────────────────────────────

async function prompt(question: string, defaultValue?: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        const displayQuestion = defaultValue ? `${question} (default: ${defaultValue}): ` : `${question}: `;
        rl.question(displayQuestion, (answer) => {
            rl.close();
            resolve(answer.trim() || defaultValue || '');
        });
    });
}

async function promptYesNo(question: string, defaultYes = true): Promise<boolean> {
    const answer = await prompt(question, defaultYes ? 'Y/n' : 'y/N');
    const normalized = answer.toLowerCase();
    if (normalized === 'y' || normalized === 'yes') return true;
    if (normalized === 'n' || normalized === 'no') return false;
    return defaultYes;
}

async function interactiveMode(): Promise<{
    mode: 'shop' | 'file';
    value: string;
    exportPath?: string;
    shouldImport: boolean;
    dryRun: boolean;
    overwrite: boolean;
}> {
    console.log('\n🔄 Firestore → PostgreSQL Migration Tool\n');

    const useShop = await promptYesNo('Fetch from Firestore (vs. read from file)?', true);
    const mode = useShop ? 'shop' : 'file';

    let value: string;
    if (mode === 'shop') {
        value = await prompt('Shop name');
        if (!value) {
            console.error('❌ Shop name is required');
            process.exit(1);
        }
    } else {
        // List available JSON files in Downloads folder
        const downloadsPath = '/home/flo/Downloads';
        let files: string[] = [];

        try {
            files = fs
                .readdirSync(downloadsPath)
                .filter((f) => f.endsWith('.json') && f.startsWith('firestore-'))
                .sort()
                .reverse(); // Most recent first

            if (files.length > 0) {
                console.log('\n📂 Available JSON files in Downloads:');
                files.slice(0, 10).forEach((f, i) => {
                    console.log(`   ${i + 1}. ${f}`);
                });
                if (files.length > 10) console.log(`   ... and ${files.length - 10} more`);
                console.log('');
            }
        } catch {
            // Ignore if can't read directory
        }

        // Loop until valid file is provided
        while (true) {
            const input = await prompt('JSON file path (or number from list)', '/home/flo/Downloads/');
            if (!input) {
                console.error('❌ File path is required');
                process.exit(1);
            }

            // Check if input is a number (file selection)
            const fileNum = parseInt(input, 10);
            if (!isNaN(fileNum) && fileNum >= 1 && fileNum <= files.length) {
                value = path.join(downloadsPath, files[fileNum - 1]);
                break;
            }

            // If user just entered a filename, prepend Downloads path
            value = input.includes('/') ? input : path.join(downloadsPath, input);

            // Check if file exists
            if (fs.existsSync(value)) {
                break;
            }

            console.error(`❌ File not found: ${value}`);
            console.log('Please try again or use a number from the list above.\n');
        }
    }

    let exportPath: string | undefined;
    let shouldImport = true;
    let dryRun = false;
    let overwrite = false;

    if (mode === 'shop') {
        // Fetching from Firestore: ask about export AND import
        const shouldExport = await promptYesNo('Export to JSON file?', true);
        if (shouldExport) {
            const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const defaultFilename = `firestore-${value}-${timestamp}.json`;
            const defaultPath = `/home/flo/Downloads/${defaultFilename}`;
            exportPath = await prompt('Export file path', defaultPath);
        }

        shouldImport = await promptYesNo('Import to database?', true);
        if (shouldImport) {
            dryRun = await promptYesNo('Dry run (preview only)?', false);
            overwrite = await promptYesNo('Overwrite existing transactions?', false);
        }
    } else {
        // Reading from file: only ask about import (no export needed)
        console.log('\n📁 Reading from file - will import to database\n');
        dryRun = await promptYesNo('Dry run (preview only)?', false);
        overwrite = await promptYesNo('Overwrite existing transactions?', false);
    }

    return { mode, value, exportPath, shouldImport, dryRun, overwrite };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

let cli: Awaited<ReturnType<typeof interactiveMode>>;

// Check if running in interactive mode (no arguments)
const hasArgs = process.argv.slice(2).some((arg) => arg.startsWith('--') || !arg.startsWith('-'));
if (!hasArgs) {
    cli = await interactiveMode();
} else {
    const parsed = parseArgs(process.argv);
    const exportIdx = process.argv.indexOf('--export');
    let exportPath = exportIdx !== -1 && process.argv[exportIdx + 1] ? process.argv[exportIdx + 1] : undefined;

    // If --export is specified without a path, generate default path
    if (process.argv.includes('--export') && (!exportPath || exportPath.startsWith('--'))) {
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const shopName = parsed.mode === 'shop' ? parsed.value : 'data';
        const defaultFilename = `firestore-${shopName}-${timestamp}.json`;
        exportPath = `/home/flo/Downloads/${defaultFilename}`;
    }

    // In CLI mode: if --export is the only flag, don't import. Otherwise, import by default
    const shouldImport = !exportPath || process.argv.includes('--overwrite') || process.argv.includes('--dry-run');
    cli = { ...parsed, exportPath, shouldImport };
}

// ── DB connection ────────────────────────────────────────────────────────────

function createPool(): PgPool {
    // Use NEXT_PUBLIC_SHOP_ID as database name (e.g., 'annette')
    // Falls back to PG_DATABASE for backwards compatibility
    const database = process.env.NEXT_PUBLIC_SHOP_ID || process.env.PG_DATABASE || 'dc_pos';

    return new Pool({
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432'),
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
        database,
        ssl: { rejectUnauthorized: false }, // Required for Neon
        max: 5,
    });
}

// ── Ensure payment methods exist ─────────────────────────────────────────────

async function ensurePaymentMethods(client: PoolClient): Promise<Map<string, number>> {
    const map = new Map<string, number>();

    const { rows } = await client.query<{ id: number; label: string }>('SELECT id, label FROM dc_pos.payment_methods');
    for (const row of rows) {
        map.set(row.label, row.id);
    }

    for (const label of Object.values(PAYMENT_METHOD_MAP)) {
        if (!map.has(label)) {
            const result = await client.query<{ id: number }>(
                'INSERT INTO dc_pos.payment_methods (label, currency) VALUES ($1, $2) RETURNING id',
                [label, 'EUR']
            );
            map.set(label, result.rows[0].id);
            console.log(`  Created payment method: "${label}" → id=${result.rows[0].id}`);
        }
    }

    return map;
}

// ── Load currencies ──────────────────────────────────────────────────────────

async function loadCurrencies(client: PoolClient): Promise<Map<string, number>> {
    const map = new Map<string, number>();

    const { rows } = await client.query<{ id: number; label: string; symbol: string }>(
        'SELECT id, label, symbol FROM dc_pos.currencies'
    );

    for (const row of rows) {
        map.set(row.symbol.toLowerCase(), row.id);
        map.set(row.label.toLowerCase(), row.id);
    }

    return map;
}

// ── Get default user ─────────────────────────────────────────────────────────

async function getDefaultUserId(client: PoolClient): Promise<number> {
    const result = await client.query<{ id: number }>('SELECT id FROM dc_pos.users ORDER BY id ASC LIMIT 1');

    if (result.rows.length > 0) {
        return result.rows[0].id;
    }

    // No users found - create a default admin user
    console.log('  ℹ️  No users found - creating default admin user');
    const insertResult = await client.query<{ id: number }>(
        'INSERT INTO dc_pos.users (key, name, role) VALUES ($1, $2, $3) RETURNING id',
        ['admin', 'Administrator', 'Admin']
    );

    console.log(`  ✅ Created default user with ID: ${insertResult.rows[0].id}`);
    return insertResult.rows[0].id;
}

// ── Import with batch INSERTs (fast alternative to COPY) ─────────────────────

async function importWithBatchInserts(
    client: PoolClient,
    allTransactions: TxWithMeta[],
    totalTx: number,
    cli: CliConfig
): Promise<void> {
    const BATCH_SIZE = 500;
    let imported = 0;

    // Handle overwrite mode
    if (cli.overwrite) {
        console.log('Deleting existing transactions (overwrite mode)...');
        await client.query('DELETE FROM dc_pos.transaction_items');
        await client.query('DELETE FROM dc_pos.transactions');
    }

    await client.query('BEGIN');

    try {
        // Process transactions in batches
        for (let i = 0; i < allTransactions.length; i += BATCH_SIZE) {
            const batch = allTransactions.slice(i, i + BATCH_SIZE);

            // Build multi-row INSERT for transactions
            const txValues: string[] = [];
            const txParams: (string | number | null)[] = [];
            const txHashes: string[] = [];
            const txIdMap = new Map<number, number>(); // Maps array index to DB ID

            for (let j = 0; j < batch.length; j++) {
                const { tx } = batch[j];
                const methodLabel = PAYMENT_METHOD_MAP[tx.method] ?? tx.method;
                const createdAt = msToDatetime(tx.createdDate);
                const updatedAt = msToDatetime(tx.modifiedDate);
                const note = tx.note || null;

                const hashData = `${tx.createdDate}|Cashier|${methodLabel}|${tx.amount}|${tx.currency || 'EUR'}|${createdAt}`;
                const hash = createHash('sha256').update(hashData).digest('hex').substring(0, 64);
                txHashes.push(hash);

                const paramIdx = txParams.length;
                txValues.push(
                    `($${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9})`
                );
                txParams.push(
                    tx.createdDate.toString(),
                    'Cashier',
                    methodLabel,
                    tx.amount,
                    tx.currency || 'EUR',
                    note,
                    hash,
                    createdAt,
                    updatedAt
                );
            }

            // Insert all transactions with ON CONFLICT DO NOTHING
            const txQuery = `
                INSERT INTO dc_pos.transactions (order_id, user_name, payment_method, amount, currency, note, hash, created_at, updated_at)
                VALUES ${txValues.join(', ')}
                ON CONFLICT (hash) DO NOTHING
                RETURNING id, hash
            `;

            const txResult = await client.query<{ id: number; hash: string }>(txQuery, txParams);

            // Map returned IDs to their hashes
            const hashToId = new Map<string, number>();
            for (const row of txResult.rows) {
                hashToId.set(row.hash, row.id);
            }

            // For all transactions in batch, get their IDs (either from the insert or from existing)
            for (let j = 0; j < batch.length; j++) {
                let transactionId = hashToId.get(txHashes[j]);
                if (!transactionId) {
                    // This was a duplicate, query the database for its ID
                    const existingResult = await client.query<{ id: number }>(
                        `SELECT id FROM dc_pos.transactions WHERE hash = $1`,
                        [txHashes[j]]
                    );
                    if (existingResult.rows.length > 0) {
                        transactionId = existingResult.rows[0].id;
                        hashToId.set(txHashes[j], transactionId);
                        // Log duplicate for debugging
                        const { tx } = batch[j];
                        console.warn(
                            `  ⚠ Duplicate transaction: createdDate=${tx.createdDate}, method=${tx.method}, amount=${tx.amount}`
                        );
                    }
                }
                if (transactionId) {
                    txIdMap.set(i + j, transactionId);
                }
            }

            // Build multi-row INSERT for transaction items
            const itemValues: string[] = [];
            const itemParams: (string | number | null)[] = [];

            for (let j = 0; j < batch.length; j++) {
                const { tx } = batch[j];
                const transactionId = txIdMap.get(i + j);

                if (!transactionId) continue;

                for (const p of tx.products) {
                    const discountAmount = p.discount?.value ?? p.discount?.amount ?? 0;
                    const discountUnit = p.discount?.unity ?? p.discount?.unit ?? '%';

                    const paramIdx = itemParams.length;
                    itemValues.push(
                        `($${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8})`
                    );
                    itemParams.push(
                        transactionId,
                        p.label,
                        p.category,
                        p.amount,
                        p.quantity,
                        discountAmount,
                        discountUnit || '%',
                        p.total
                    );
                }
            }

            // Insert items batch
            if (itemValues.length > 0) {
                const itemQuery = `
                    INSERT INTO dc_pos.transaction_items (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total)
                    VALUES ${itemValues.join(', ')}
                `;
                await client.query(itemQuery, itemParams);
            }

            imported += batch.length;
            process.stdout.write(`\r⏳ Progress: ${imported}/${totalTx}`);
        }

        await client.query('COMMIT');
        process.stdout.write('\r' + ' '.repeat(100) + '\r');
        console.log(`\n✨ Done! Imported ${imported} transactions.`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌ Error during batch import:', err);
        throw err;
    }
}

// ── Main import ──────────────────────────────────────────────────────────────

async function main() {
    // Load data
    const entries: TransactionSet[] =
        cli.mode === 'shop' ? await fetchFromFirestore(cli.value) : loadFromFile(cli.value);

    // Count totals
    let totalTx = 0;
    let skippedTx = 0;
    for (const entry of entries) {
        for (const tx of entry.transactions) {
            if (SKIP_METHODS.has(tx.method)) skippedTx++;
            else totalTx++;
        }
    }
    console.log(`Found ${entries.length} days, ${totalTx} transactions to import (${skippedTx} deleted skipped)`);

    // Export to JSON file if requested
    if (cli.exportPath) {
        console.log(`\n📝 Exporting to ${cli.exportPath}...`);
        fs.writeFileSync(cli.exportPath, JSON.stringify(entries, null, 2), 'utf-8');
        console.log(`✅ Exported ${entries.length} days (${totalTx} transactions) to ${cli.exportPath}`);
    }

    // If not importing to database, we're done
    if (!cli.shouldImport) {
        console.log('\n✨ Export completed. Skipping database import.');
        return;
    }

    if (cli.dryRun) {
        console.log('\n[DRY RUN] No database changes will be made.\n');
        for (const entry of entries.slice(0, 3)) {
            console.log(`  ${entry.id}: ${entry.transactions.length} transactions`);
        }
        if (entries.length > 3) console.log(`  ... (${entries.length - 3} more)`);

        // Check for duplicates in the data
        console.log('\n🔍 Checking for duplicate transactions in data...');
        const hashCounts = new Map<string, number>();
        const hashToTx = new Map<
            string,
            { tx: TransactionSet['transactions'][0]; methodLabel: string; createdAt: string }
        >();

        for (const entry of entries) {
            for (const tx of entry.transactions) {
                if (SKIP_METHODS.has(tx.method)) continue;

                const methodLabel = PAYMENT_METHOD_MAP[tx.method] ?? tx.method;
                const createdAt = msToDatetime(tx.createdDate);
                const hashData = `${tx.createdDate}|Cashier|${methodLabel}|${tx.amount}|${tx.currency || 'EUR'}|${createdAt}`;
                const hash = createHash('sha256').update(hashData).digest('hex').substring(0, 64);

                hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
                if (!hashToTx.has(hash)) {
                    hashToTx.set(hash, { tx, methodLabel, createdAt });
                }
            }
        }

        let duplicateCount = 0;
        for (const [hash, count] of hashCounts) {
            if (count > 1) {
                duplicateCount++;
                const { tx, methodLabel, createdAt } = hashToTx.get(hash)!;
                console.warn(
                    `  ⚠ Duplicate hash (${count} occurrences): createdDate=${tx.createdDate}, method=${methodLabel}, amount=${tx.amount}, createdAt=${createdAt}`
                );
            }
        }

        if (duplicateCount === 0) {
            console.log('  ✅ No duplicate transactions found in data.');
        } else {
            console.log(`  ⚠ Found ${duplicateCount} duplicate transaction hashes in data.`);
        }

        return;
    }

    const pool = createPool();
    const client = await pool.connect();

    try {
        console.log('Connected to PostgreSQL.');

        console.log('Ensuring payment methods...');
        const paymentMethodMap = await ensurePaymentMethods(client);
        console.log(`Payment methods ready (${paymentMethodMap.size} methods).`);

        console.log('Loading currencies...');
        const currencyMap = await loadCurrencies(client);
        console.log(`Currencies loaded (${currencyMap.size} mappings).`);

        console.log('Getting default user...');
        const defaultUserId = await getDefaultUserId(client);
        console.log(`Default user ID: ${defaultUserId}`);

        // Flatten all transactions into a single array with metadata
        interface TxWithMeta {
            tx: TransactionSet['transactions'][0];
            panierId: string;
            index: number;
        }
        const allTransactions: TxWithMeta[] = [];
        let txIndex = 0;
        for (const entry of entries) {
            for (const tx of entry.transactions) {
                if (!SKIP_METHODS.has(tx.method)) {
                    allTransactions.push({ tx, panierId: entry.id, index: txIndex++ });
                }
            }
        }

        console.log('\n🚀 Using batch INSERT mode for fast bulk loading');
        await importWithBatchInserts(client, allTransactions, totalTx, cli);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
