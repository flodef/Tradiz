/**
 * Firestore → PostgreSQL importer for Tradiz
 *
 * Imports transaction data into the PostgreSQL `facturation` + `facturation_article` tables.
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
import { Pool, type PoolClient } from 'pg';
import { fetchFromFirestore, loadFromFile } from './import/firestore';
import { parseArgs, PAYMENT_METHOD_MAP, SKIP_METHODS, msToDatetime } from './import/types';
import type { TransactionSet } from './import/types';
import * as fs from 'fs';
import * as readline from 'readline';

type PgPool = InstanceType<typeof Pool>;

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
        try {
            const files = fs
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

        value = await prompt('JSON file path', '/home/flo/Downloads/');
        if (!value) {
            console.error('❌ File path is required');
            process.exit(1);
        }

        // If user just entered a filename, prepend Downloads path
        if (!value.includes('/')) {
            value = `/home/flo/Downloads/${value}`;
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
    return new Pool({
        host: process.env.PG_HOST || 'localhost',
        port: Number(process.env.PG_PORT) || 5432,
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
        database: process.env.PG_DATABASE || 'dc_pos',
        ssl: { rejectUnauthorized: false }, // Required for Neon
        max: 5,
    });
}

// ── Ensure payment methods exist ─────────────────────────────────────────────

async function ensurePaymentMethods(client: PoolClient): Promise<Map<string, number>> {
    const map = new Map<string, number>();

    const { rows } = await client.query<{ id: number; label: string }>('SELECT id, label FROM payment_methods');
    for (const row of rows) {
        map.set(row.label, row.id);
    }

    for (const label of Object.values(PAYMENT_METHOD_MAP)) {
        if (!map.has(label)) {
            const result = await client.query<{ id: number }>(
                'INSERT INTO payment_methods (label, currency) VALUES ($1, $2) RETURNING id',
                [label, 'EUR']
            );
            map.set(label, result.rows[0].id);
            console.log(`  Created payment method: "${label}" → id=${result.rows[0].id}`);
        }
    }

    return map;
}

// ── Get default user ─────────────────────────────────────────────────────────

async function getDefaultUserId(client: PoolClient): Promise<number> {
    const result = await client.query<{ id: number }>('SELECT id FROM users ORDER BY id ASC LIMIT 1');

    if (result.rows.length > 0) {
        return result.rows[0].id;
    }

    // No users found - create a default admin user
    console.log('  ℹ️  No users found - creating default admin user');
    const insertResult = await client.query<{ id: number }>(
        'INSERT INTO users (key, name, role) VALUES ($1, $2, $3) RETURNING id',
        ['admin', 'Administrator', 'Admin']
    );

    console.log(`  ✅ Created default user with ID: ${insertResult.rows[0].id}`);
    return insertResult.rows[0].id;
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
        return;
    }

    const pool = createPool();
    const client = await pool.connect();

    try {
        console.log('Connected to PostgreSQL.');

        console.log('Ensuring payment methods...');
        const paymentMethodMap = await ensurePaymentMethods(client);
        console.log(`Payment methods ready (${paymentMethodMap.size} methods).`);

        console.log('Getting default user...');
        const defaultUserId = await getDefaultUserId(client);
        console.log(`Default user ID: ${defaultUserId}`);

        let imported = 0;
        let errors = 0;
        let processed = 0;

        console.log('\n📊 Importing transactions...\n');

        for (const entry of entries) {
            const panierId = entry.id;

            for (const tx of entry.transactions) {
                if (SKIP_METHODS.has(tx.method)) continue;

                processed++;

                // Update progress counter (overwrite same line)
                process.stdout.write(
                    `\r⏳ Progress: ${processed}/${totalTx} | ✅ Imported: ${imported} | ❌ Errors: ${errors}`
                );

                const methodLabel = PAYMENT_METHOD_MAP[tx.method] ?? tx.method;
                const paymentMethodId = paymentMethodMap.get(methodLabel);

                if (!paymentMethodId) {
                    console.warn(`  ⚠ Unknown payment method "${tx.method}", skipping transaction`);
                    errors++;
                    continue;
                }

                const createdAt = msToDatetime(tx.createdDate);
                const updatedAt = msToDatetime(tx.modifiedDate);

                // Parse user ID safely - use default if invalid
                let userId = defaultUserId;
                if (tx.validator) {
                    const parsed = parseInt(tx.validator, 10);
                    if (!isNaN(parsed)) {
                        userId = parsed;
                    }
                }

                const note = tx.note || null;

                try {
                    await client.query('BEGIN');

                    let facturationId: number;

                    // Check if transaction already exists (by created_at timestamp)
                    const existingResult = await client.query<{ id: number }>(
                        `SELECT id FROM facturation WHERE created_at = $1`,
                        [createdAt]
                    );

                    if (existingResult.rows.length > 0) {
                        if (!cli.overwrite) {
                            await client.query('ROLLBACK');
                            continue; // Skip duplicate
                        }
                        // Overwrite mode: delete existing transaction and its articles
                        facturationId = existingResult.rows[0].id;
                        await client.query(`DELETE FROM facturation_article WHERE facturation_id = $1`, [
                            facturationId,
                        ]);
                        await client.query(`DELETE FROM facturation WHERE id = $1`, [facturationId]);
                    }

                    // Use transaction.createdDate as panier_id (integer timestamp)
                    const factResult = await client.query<{ id: number }>(
                        `INSERT INTO facturation (panier_id, user_id, payment_method_id, amount, currency_id, note, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                        [tx.createdDate, userId, paymentMethodId, tx.amount, null, note, createdAt, updatedAt]
                    );
                    facturationId = factResult.rows[0].id;

                    for (const p of tx.products) {
                        const discountAmount = p.discount?.value ?? p.discount?.amount ?? 0;
                        const discountUnit = p.discount?.unity ?? p.discount?.unit ?? '%';

                        await client.query(
                            `INSERT INTO facturation_article (facturation_id, label, category, amount, quantity, discount_amount, discount_unit, total)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                            [
                                facturationId,
                                p.label,
                                p.category,
                                p.amount,
                                p.quantity,
                                discountAmount,
                                discountUnit || '%',
                                p.total,
                            ]
                        );
                    }

                    await client.query('COMMIT');
                    imported++;
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`  ✗ Error importing transaction from ${panierId} at ${createdAt}:`, err);
                    errors++;
                }
            }
        }

        // Clear progress line and show final summary
        process.stdout.write('\r' + ' '.repeat(100) + '\r'); // Clear the line
        console.log(`\n✨ Done! Imported ${imported} transactions (${errors} errors).`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
