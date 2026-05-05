/**
 * Firestore → MariaDB importer for Tradiz
 *
 * Imports transaction data into the MariaDB `facturation` + `facturation_article` tables.
 * Data can be fetched directly from Firestore or read from a JSON dump file.
 *
 * Usage:
 *   bun run scripts/firestore-to-mariadb.ts --shop <shopname> [--dry-run]
 *   bun run scripts/firestore-to-mariadb.ts --file <path.json> [--dry-run]
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

// ── CLI ──────────────────────────────────────────────────────────────────────

const cli = parseArgs(process.argv);

// ── DB connection ────────────────────────────────────────────────────────────

function createPool(): mysql.Pool {
    return mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'DC_POS',
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
                            continue; // Skip duplicate
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
                } catch (err) {
                    await conn.rollback();
                    console.error(`  ✗ Error importing transaction from ${panierId} at ${createdAt}:`, err);
                    errors++;
                }
            }
        }

        // Clear progress line and show final summary
        process.stdout.write('\r' + ' '.repeat(100) + '\r'); // Clear the line
        console.log(`\n✨ Done! Imported ${imported} transactions (${errors} errors).`);
    } finally {
        conn.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
