#!/usr/bin/env bun
/**
 * Restore products from one PostgreSQL database to another.
 *
 * Typical use case: copy the products table from a dev/replica Neon DB to the
 * main (empty) DB, without touching transactions, users, or history.
 *
 * Usage:
 *   bun scripts/restore-products-from-db.ts
 *
 * The script uses PG_USER, PG_PASSWORD and NEXT_PUBLIC_SHOP_ID from .env.local.
 * It prompts for the source and target PG hosts, defaulting to PG_HOST.
 * Add --dry-run to preview the row count without writing anything.
 */

import { Client } from 'pg';
import * as readline from 'readline/promises';

function buildConnectionString(host: string) {
    const user = process.env.PG_USER;
    const password = process.env.PG_PASSWORD;
    const database = process.env.NEXT_PUBLIC_SHOP_ID;

    if (!host || !user || !password || !database) {
        throw new Error(
            'Missing connection details. Make sure PG_USER, PG_PASSWORD, NEXT_PUBLIC_SHOP_ID and the host are set.'
        );
    }

    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${encodeURIComponent(database)}?sslmode=verify-full`;
}

async function getColumns(client: Client, schema: string, table: string): Promise<string[]> {
    const result = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, table]
    );
    return result.rows.map((row) => row.column_name as string);
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const defaultHost = process.env.PG_HOST || '';

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const sourceHost = (await rl.question(`Source PG host (default: ${defaultHost}): `)).trim() || defaultHost;
    const targetHost = (await rl.question(`Target PG host (default: ${defaultHost}): `)).trim() || defaultHost;
    rl.close();

    if (!sourceHost) {
        throw new Error('Source PG host is required.');
    }
    if (!targetHost) {
        throw new Error('Target PG host is required.');
    }

    const sourceConnectionString = buildConnectionString(sourceHost);
    const targetConnectionString = buildConnectionString(targetHost);

    const source = new Client({ connectionString: sourceConnectionString, ssl: { rejectUnauthorized: false } });
    const target = new Client({ connectionString: targetConnectionString, ssl: { rejectUnauthorized: false } });

    try {
        await source.connect();
        await target.connect();

        // Sanity-check the source has products.
        const sourceCountResult = await source.query('SELECT count(*) FROM dc.products');
        const sourceCount = Number(sourceCountResult.rows[0].count);
        console.log(`📊 Source products: ${sourceCount}`);

        if (sourceCount === 0) {
            console.log('⚠️  Source has no products. Nothing to restore.');
            return;
        }

        if (dryRun) {
            console.log(`🔍 Dry run: would copy ${sourceCount} products to target.`);
            return;
        }

        // Get columns so we can adapt between schema versions (e.g. category_id vs category).
        const sourceColumns = await getColumns(source, 'dc', 'products');
        const targetColumns = await getColumns(target, 'dc', 'products');

        // Read all source products.
        const rows = (await source.query('SELECT * FROM dc.products')).rows;

        // Build a normalized row: prefer target column names, fall back to legacy names.
        const normalized = rows.map((row) => {
            const out: Record<string, unknown> = {};
            for (const col of targetColumns) {
                if (sourceColumns.includes(col)) {
                    out[col] = row[col];
                } else if (col === 'category' && sourceColumns.includes('category_id')) {
                    out[col] = row.category_id;
                } else if (col === 'category_id' && sourceColumns.includes('category')) {
                    out[col] = row.category;
                } else {
                    out[col] = null;
                }
            }
            return out;
        });

        // Clear target products and re-insert in a transaction.
        await target.query('BEGIN');
        await target.query('DELETE FROM dc.products');

        const insertColumns = targetColumns.filter((col) => col !== 'id' || normalized.some((r) => r.id != null));
        const paramSlots = insertColumns.map((_, i) => `$${i + 1}`).join(', ');
        const insertQuery = `INSERT INTO dc.products (${insertColumns.join(', ')}) VALUES (${paramSlots})`;

        for (const row of normalized) {
            const values = insertColumns.map((col) => row[col]);
            await target.query(insertQuery, values);
        }

        await target.query('COMMIT');

        // Reset the sequence if we're using explicit ids so future inserts don't conflict.
        if (insertColumns.includes('id')) {
            const maxId = await target.query('SELECT MAX(id) FROM dc.products');
            const maxIdValue = maxId.rows[0].max;
            if (maxIdValue != null) {
                await target.query("SELECT setval(pg_get_serial_sequence('dc.products', 'id'), $1)", [maxIdValue]);
            }
        }

        console.log(`✅ Restored ${normalized.length} products to target.`);

        // Verify.
        const targetCountResult = await target.query('SELECT count(*) FROM dc.products');
        console.log(`📊 Target products now: ${targetCountResult.rows[0].count}`);
    } catch (error) {
        console.error('❌ Restore failed:', error);
        try {
            await target.query('ROLLBACK');
        } catch {
            // ignore rollback errors
        }
        process.exit(1);
    } finally {
        await source.end();
        await target.end();
    }
}

main();
