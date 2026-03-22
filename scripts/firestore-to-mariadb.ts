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

        let imported = 0;
        let errors = 0;

        for (const entry of entries) {
            const panierId = entry.id;

            for (const tx of entry.transactions) {
                if (SKIP_METHODS.has(tx.method)) continue;

                const methodLabel = PAYMENT_METHOD_MAP[tx.method] ?? tx.method;
                const paymentMethodId = paymentMethodMap.get(methodLabel);

                if (!paymentMethodId) {
                    console.warn(`  ⚠ Unknown payment method "${tx.method}", skipping transaction`);
                    errors++;
                    continue;
                }

                const createdAt = msToDatetime(tx.createdDate);
                const updatedAt = msToDatetime(tx.modifiedDate);
                const validator = tx.validator || null;
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
                        [tx.createdDate, validator, paymentMethodId, tx.amount, 'EUR', note, createdAt, updatedAt]
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

        console.log(`\nDone! Imported ${imported} transactions (${errors} errors).`);
    } finally {
        conn.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
