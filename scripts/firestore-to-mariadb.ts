/**
 * Firestore → MariaDB importer for Tradiz
 *
 * Imports transaction data into the MariaDB `facturation` + `facturation_article` tables.
 * Data can be fetched directly from Firestore or read from a JSON dump file.
 *
 * Usage:
 *   bun run scripts/firestore-to-mariadb.ts                    (interactive mode)
 *   bun run scripts/firestore-to-mariadb.ts --shop <shopname> [--dry-run] [--export <file.json>]
 *   bun run scripts/firestore-to-mariadb.ts --file <path.json> [--dry-run]
 *
 * Options:
 *   --shop <name>       Fetch from Firestore for this shop
 *   --file <path>       Read from JSON file instead of Firestore
 *   --export <path>     Export to JSON file (don't import to DB)
 *   --dry-run           Preview without making changes
 *   --overwrite         Overwrite existing transactions
 *
 * Environment variables (or .env):
 *   DB_HOST     – MariaDB host        (default: localhost)
 *   DB_PORT     – MariaDB port        (default: 3306)
 *   DB_USER     – MariaDB user        (default: root)
 *   DB_PASSWORD – MariaDB password    (default: empty)
 *   DB_NAME     – MariaDB database    (default: DC_POS)
 *
 *   For --shop mode (Firebase):
 *   GOOGLE_APPLICATION_CREDENTIALS – path to service account key JSON
 *   (or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)
 */

import 'dotenv/config';
import * as mysql from 'mysql2/promise';
import { fetchFromFirestore, loadFromFile } from './import/firestore';
import { parseArgs, PAYMENT_METHOD_MAP, SKIP_METHODS, msToDatetime } from './import/types';
import type { TransactionSet } from './import/types';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';

// ── Configuration ────────────────────────────────────────────────────────────

const BATCH_SIZE = 50; // Process transactions in batches
const MAX_RETRIES = 3; // Retry failed transactions
const CHECKPOINT_FILE = '/home/flo/Downloads/.firestore-mariadb-checkpoint.json';

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

async function promptYesNo(question: string, defaultYes: boolean): Promise<boolean> {
    const defaultHint = defaultYes ? 'Y/n' : 'y/N';
    const answer = await prompt(`${question} (default: ${defaultHint})`);
    if (!answer) return defaultYes;
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

async function interactiveMode(): Promise<{
    mode: 'shop' | 'file';
    value: string;
    exportPath?: string;
    shouldImport: boolean;
    dryRun: boolean;
    overwrite: boolean;
}> {
    console.log('\n🔄 Firestore → MariaDB Migration Tool\n');

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

function createPool(): mysql.Pool {
    // Use NEXT_PUBLIC_SHOP_ID as database name (e.g., 'annette')
    // Falls back to DB_NAME for backwards compatibility
    const database = process.env.NEXT_PUBLIC_SHOP_ID || 'DC_POS';

    return mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database,
        waitForConnections: true,
        connectionLimit: 5,
    });
}

// ── Ensure payment methods exist ─────────────────────────────────────────────

async function ensurePaymentMethods(conn: mysql.PoolConnection): Promise<Map<string, number>> {
    const map = new Map<string, number>();

    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT id, label FROM payment_methods');
    for (const row of rows) {
        map.set(row.label as string, row.id as number);
    }

    for (const label of Object.values(PAYMENT_METHOD_MAP)) {
        if (!map.has(label)) {
            const [result] = await conn.execute<mysql.ResultSetHeader>(
                'INSERT INTO payment_methods (label, currency) VALUES (?, ?)',
                [label, 'EUR']
            );
            map.set(label, result.insertId);
            console.log(`  Created payment method: "${label}" → id=${result.insertId}`);
        }
    }

    return map;
}

// ── Get default user ─────────────────────────────────────────────────────────

async function getDefaultUserId(conn: mysql.PoolConnection): Promise<number> {
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT id FROM users ORDER BY id ASC LIMIT 1');

    if (rows.length > 0) {
        return rows[0].id as number;
    }

    // No users found - create a default admin user
    console.log('  ℹ️  No users found - creating default admin user');
    const [result] = await conn.execute<mysql.ResultSetHeader>(
        'INSERT INTO users (`key`, name, role) VALUES (?, ?, ?)',
        ['admin', 'Administrator', 'Admin']
    );

    console.log(`  ✅ Created default user with ID: ${result.insertId}`);
    return result.insertId;
}

// ── Checkpoint management ────────────────────────────────────────────────────

interface Checkpoint {
    lastProcessedIndex: number;
    imported: number;
    errors: number;
    timestamp: string;
}

function loadCheckpoint(): Checkpoint | null {
    try {
        if (fs.existsSync(CHECKPOINT_FILE)) {
            const data = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch {
        // Ignore errors
    }
    return null;
}

function saveCheckpoint(checkpoint: Checkpoint): void {
    try {
        fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), 'utf-8');
    } catch {
        // Ignore errors
    }
}

function clearCheckpoint(): void {
    try {
        if (fs.existsSync(CHECKPOINT_FILE)) {
            fs.unlinkSync(CHECKPOINT_FILE);
        }
    } catch {
        // Ignore errors
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
        return;
    }

    const pool = createPool();
    const conn = await pool.getConnection();

    try {
        console.log('Connected to MariaDB.');

        console.log('Ensuring payment methods...');
        const paymentMethodMap = await ensurePaymentMethods(conn);
        console.log(`Payment methods ready (${paymentMethodMap.size} methods).`);

        console.log('Getting default user...');
        const defaultUserId = await getDefaultUserId(conn);
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

        // Check for existing checkpoint
        const checkpoint = loadCheckpoint();
        let startIndex = 0;
        let imported = 0;
        let errors = 0;

        if (checkpoint && checkpoint.lastProcessedIndex >= 0) {
            const resume = await promptYesNo(
                `\n🔄 Found checkpoint from ${checkpoint.timestamp}. Resume from transaction ${checkpoint.lastProcessedIndex + 1}/${totalTx}?`,
                true
            );
            if (resume) {
                startIndex = checkpoint.lastProcessedIndex + 1;
                imported = checkpoint.imported;
                errors = checkpoint.errors;
                console.log(`✅ Resuming from transaction ${startIndex + 1}...`);
            } else {
                clearCheckpoint();
            }
        }

        console.log('\n📊 Importing transactions...\n');

        // Process in batches with retry logic
        for (let i = startIndex; i < allTransactions.length; i++) {
            const { tx, panierId, index } = allTransactions[i];

            // Update progress counter (overwrite same line)
            process.stdout.write(
                `\r⏳ Progress: ${index + 1}/${totalTx} | ✅ Imported: ${imported} | ❌ Errors: ${errors}`
            );

            // Save checkpoint every BATCH_SIZE transactions
            if (i > 0 && i % BATCH_SIZE === 0) {
                saveCheckpoint({
                    lastProcessedIndex: i - 1,
                    imported,
                    errors,
                    timestamp: new Date().toISOString(),
                });
            }

            const methodLabel = PAYMENT_METHOD_MAP[tx.method] ?? tx.method;
            const paymentMethodId = paymentMethodMap.get(methodLabel);

            if (!paymentMethodId) {
                process.stdout.write('\r' + ' '.repeat(100) + '\r');
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

            // Retry logic
            let success = false;
            for (let attempt = 1; attempt <= MAX_RETRIES && !success; attempt++) {
                try {
                    await conn.beginTransaction();

                    let facturationId: number;

                    // Check if transaction already exists (by created_at timestamp)
                    const [existing] = await conn.execute<mysql.RowDataPacket[]>(
                        `SELECT id FROM facturation WHERE created_at = ?`,
                        [createdAt]
                    );

                    if (existing.length > 0) {
                        if (!cli.overwrite) {
                            await conn.rollback();
                            success = true; // Skip duplicate, don't retry
                            break;
                        }
                        // Overwrite mode: delete existing transaction and its articles
                        facturationId = existing[0].id as number;
                        await conn.execute(`DELETE FROM facturation_article WHERE facturation_id = ?`, [facturationId]);
                        await conn.execute(`DELETE FROM facturation WHERE id = ?`, [facturationId]);
                    }

                    // Use transaction.createdDate as panier_id (integer timestamp)
                    const [factResult] = await conn.execute<mysql.ResultSetHeader>(
                        `INSERT INTO facturation (panier_id, user_id, payment_method_id, amount, currency, note, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [tx.createdDate, userId, paymentMethodId, tx.amount, 'EUR', note, createdAt, updatedAt]
                    );
                    facturationId = factResult.insertId;

                    for (const p of tx.products) {
                        const discountAmount = p.discount?.value ?? p.discount?.amount ?? 0;
                        const discountUnit = p.discount?.unity ?? p.discount?.unit ?? '%';

                        await conn.execute(
                            `INSERT INTO facturation_article (facturation_id, label, category, amount, quantity, discount_amount, discount_unit, total)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

                    await conn.commit();
                    imported++;
                    success = true;
                } catch (err) {
                    await conn.rollback();
                    if (attempt < MAX_RETRIES) {
                        // Wait before retry (exponential backoff)
                        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                    } else {
                        // Final attempt failed
                        process.stdout.write('\r' + ' '.repeat(100) + '\r');
                        console.error(
                            `  ✗ Error importing transaction from ${panierId} at ${createdAt} (${MAX_RETRIES} attempts):`,
                            err
                        );
                        errors++;
                    }
                }
            }
        }

        // Clear progress line and show final summary
        process.stdout.write('\r' + ' '.repeat(100) + '\r'); // Clear the line
        console.log(`\n✨ Done! Imported ${imported} transactions (${errors} errors).`);

        // Clear checkpoint on successful completion
        clearCheckpoint();
    } finally {
        conn.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
