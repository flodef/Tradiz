/**
 * Firestore → PostgreSQL importer for Tradiz
 *
 * Imports transaction data into the PostgreSQL `facturation` + `facturation_article` tables.
 * Data can be fetched directly from Firestore or read from a JSON dump file.
 *
 * Usage:
 *   bun run scripts/firestore-to-postgres.ts --shop <shopname> [--dry-run]
 *   bun run scripts/firestore-to-postgres.ts --file <path.json> [--dry-run]
 *
 * Environment variables (or .env):
 *   PG_HOST     – PostgreSQL host     (default: localhost)
 *   PG_PORT     – PostgreSQL port     (default: 5432)
 *   PG_USER     – PostgreSQL user     (default: postgres)
 *   PG_PASSWORD – PostgreSQL password (default: empty)
 *   PG_DATABASE – PostgreSQL database (default: DC_POS)
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

type PgPool = InstanceType<typeof Pool>;

// ── CLI ──────────────────────────────────────────────────────────────────────

const cli = parseArgs(process.argv);

// ── DB connection ────────────────────────────────────────────────────────────

function createPool(): PgPool {
    return new Pool({
        host: process.env.PG_HOST || 'localhost',
        port: Number(process.env.PG_PORT) || 5432,
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
        database: process.env.PG_DATABASE || 'DC_POS',
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
    const client = await pool.connect();

    try {
        console.log('Connected to PostgreSQL.');

        console.log('Ensuring payment methods...');
        const paymentMethodMap = await ensurePaymentMethods(client);

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
                    await client.query('BEGIN');

                    const factResult = await client.query<{ id: number }>(
                        `INSERT INTO facturation (panier_id, user_id, payment_method_id, amount, currency, note, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                        [panierId, validator, paymentMethodId, tx.amount, 'EUR', note, createdAt, updatedAt]
                    );
                    const facturationId = factResult.rows[0].id;

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

        console.log(`\nDone! Imported ${imported} transactions (${errors} errors).`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
