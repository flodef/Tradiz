/**
 * Check product stock in PostgreSQL database
 *
 * Usage: bun run scripts/check-product-stock.ts
 */

import 'dotenv/config';
import { Pool } from 'pg';

// Colors for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
};

function log(message: string, color = 'reset') {
    console.log(`${colors[color as keyof typeof colors]}${message}${colors.reset}`);
}

async function checkProductStock() {
    // Check DATABASE connection parameters
    if (!process.env.PG_HOST || !process.env.PG_USER || !process.env.PG_PASSWORD) {
        log('❌ ERROR: Database connection parameters not found in environment', 'red');
        log('Please add PG_HOST, PG_USER, and PG_PASSWORD to your .env.local file', 'yellow');
        process.exit(1);
    }

    // Build connection config from environment variables
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

        // Check total products
        const totalResult = await client.query('SELECT COUNT(*) FROM dc.products');
        const total = parseInt(totalResult.rows[0].count);
        log(`\n📊 Total products: ${total}`, 'blue');

        // Check products with stock = 0 (unavailable)
        const unavailableResult = await client.query('SELECT COUNT(*) FROM dc.products WHERE stock = 0');
        const unavailable = parseInt(unavailableResult.rows[0].count);
        log(`📊 Unavailable products (stock = 0): ${unavailable}`, 'yellow');

        // Check products with stock = null (available/unlimited)
        const availableResult = await client.query('SELECT COUNT(*) FROM dc.products WHERE stock IS NULL');
        const available = parseInt(availableResult.rows[0].count);
        log(`📊 Available products (stock = NULL): ${available}`, 'green');

        // Show sample of unavailable products
        if (unavailable > 0) {
            log('\n🔍 Sample unavailable products:', 'yellow');
            const sampleResult = await client.query(
                'SELECT name, category, stock FROM dc.products WHERE stock = 0 LIMIT 10'
            );
            sampleResult.rows.forEach((row) => {
                log(`  - ${row.name} (${row.category}): stock = ${row.stock}`, 'yellow');
            });
        }

        // Show sample of available products
        if (available > 0) {
            log('\n🔍 Sample available products:', 'green');
            const sampleResult = await client.query(
                'SELECT name, category, stock FROM dc.products WHERE stock IS NULL LIMIT 10'
            );
            sampleResult.rows.forEach((row) => {
                log(`  - ${row.name} (${row.category}): stock = ${row.stock}`, 'green');
            });
        }

        client.release();
        await pool.end();

        log('\n✨ Check completed successfully!', 'green');
    } catch (error) {
        log('\n❌ Check failed:', 'red');
        console.error(error);
        await pool.end();
        process.exit(1);
    }
}

checkProductStock();
