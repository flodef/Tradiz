#!/usr/bin/env bun
/**
 * Sync all products from Google Sheets to PostgreSQL
 *
 * This script fetches all products from Google Sheets and completely replaces
 * the products table in the PostgreSQL database. It deletes all existing products
 * and inserts all products from the spreadsheet.
 *
 * Usage: bun run scripts/update-product-stock.ts
 */

import { Client } from 'pg';

// Environment validation
const requiredEnvVars = [
    'GOOGLE_API_KEY',
    'SHOP_SPREADSHEET_ID',
    'PG_HOST',
    'PG_USER',
    'PG_PASSWORD',
    'NEXT_PUBLIC_SHOP_ID',
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

// Get shop name from environment
const SHOP_NAME = process.env.NEXT_PUBLIC_SHOP_ID!;

// PostgreSQL client configuration
const pgConfig = {
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: SHOP_NAME,
    ssl: { rejectUnauthorized: false },
};

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

interface SheetData {
    values?: (string | number | boolean)[][];
    options?: (string | null)[];
    error?: { message: string };
}

/**
 * Fetch data from Google Sheets
 */
async function fetchSheetData(sheetName: string, isRaw = true): Promise<SheetData> {
    const spreadsheetId = process.env.SHOP_SPREADSHEET_ID;
    const apiKey = process.env.GOOGLE_API_KEY;
    const valueRenderOption = isRaw ? 'valueRenderOption=UNFORMATTED_VALUE&' : '';

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A%3AZ?${valueRenderOption}key=${apiKey}`;

    try {
        const response = await fetch(url, {
            headers: {
                Referer: 'https://www.fims.fi',
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            return { error: { message: `HTTP ${response.status}` } };
        }

        return await response.json();
    } catch (error) {
        return { error: { message: String(error) } };
    }
}

/**
 * Sync all products from Google Sheets to PostgreSQL
 */
async function syncProducts() {
    log('🔄 Syncing all products from Google Sheets...\n', 'blue');

    const client = new Client(pgConfig);

    try {
        await client.connect();
        log('✅ Connected to PostgreSQL', 'green');

        // Fetch products from Google Sheets
        log('📥 Fetching products from Google Sheets...', 'blue');
        const data = await fetchSheetData('_Produits');

        if (data.error || !data.values || data.values.length < 2) {
            log('❌ No products data found in Google Sheets', 'red');
            await client.end();
            return;
        }

        // Parse products data (skip header row)
        const rowsAfterHeader = data.values.slice(1);
        const optionsArr = data.options ?? [];

        // Filter out empty rows
        const filtered = rowsAfterHeader
            .map((item, origIdx) => ({ item, origIdx }))
            .filter(({ item }) => item[1] != null && String(item[1]).trim() !== '') // category not empty
            .filter(({ item }) => item[2] != null && String(item[2]).trim() !== ''); // label not empty

        log(`📊 Found ${filtered.length} products in Google Sheets\n`, 'blue');

        // Delete all existing products
        log('🗑️  Deleting all existing products...', 'yellow');
        const deleteResult = await client.query('DELETE FROM dc.products');
        log(`✅ Deleted ${deleteResult.rowCount} existing products\n`, 'green');

        // Build category order from first appearance to compute encoded sort_order
        const categoryOrder: string[] = [];
        for (const { item: row } of filtered) {
            if (row.length >= 4) {
                const cat = String(row[1]).trim();
                if (cat && !categoryOrder.includes(cat)) categoryOrder.push(cat);
            }
        }
        const positionInCat: Record<string, number> = {};

        const products: Array<{
            sort_order: number;
            name: string;
            price: number;
            photo: string;
            category_id: string;
            description: string;
            vat_rate: number;
            stock: number | null;
            reference: string | null;
            options: string;
        }> = [];

        for (const { item: row, origIdx } of filtered) {
            if (row.length >= 4) {
                // Parse VAT rate - handle both formatted strings ("5,5%") and raw numbers (5.5 or 0.055)
                let taux_tva = 0.2; // Default 20% if not specified
                const rawTva = row[0];
                if (rawTva != null) {
                    // If it's already a number
                    if (typeof rawTva === 'number') {
                        // If it's a decimal (e.g., 0.055), convert to percentage (5.5)
                        if (rawTva < 1) {
                            taux_tva = rawTva * 100;
                        } else {
                            // It's already a percentage (e.g., 5.5)
                            taux_tva = rawTva;
                        }
                    } else {
                        // It's a string - parse percentage format (e.g., "5,5%" → 5.5)
                        const strTva = String(rawTva).trim();
                        if (strTva) {
                            const parsed = strTva.replace('%', '').replace(',', '.');
                            const num = Number(parsed);
                            if (!isNaN(num)) {
                                // If the parsed number is a decimal (e.g., 0.055), convert to percentage
                                taux_tva = num < 1 ? num * 100 : num;
                            }
                        }
                    }
                }

                const category_id = String(row[1]).trim();
                const name = String(row[2]).trim();
                const unavailable = row[3]; // true/false or 1/0
                // stock = null means unlimited (available), stock = 0 means out of stock (unavailable)
                const stock = unavailable ? 0 : null;
                const price = Number(row[4]) || 0; // First price (Euro)
                const options = optionsArr[origIdx] ?? '';

                if (name && category_id) {
                    // Compute encoded sort_order: (catIdx + 1) * 10000 + (posInCat + 1)
                    const catIdx = categoryOrder.indexOf(category_id);
                    const pos = positionInCat[category_id] ?? 0;
                    positionInCat[category_id] = pos + 1;
                    const sort_order = (catIdx + 1) * 10000 + (pos + 1);

                    products.push({
                        sort_order,
                        name,
                        price,
                        photo: '', // No photo in spreadsheet
                        stock,
                        reference: null,
                        category_id,
                        vat_rate: taux_tva,
                        description: '', // No description in spreadsheet
                        options: String(options || ''),
                    });
                }
            }
        }

        // Insert all products
        log('📥 Inserting products into database...', 'blue');
        let insertedCount = 0;
        for (const product of products) {
            await client.query(
                `INSERT INTO dc.products (sort_order, name, price, photo, category_id, description, vat_rate, stock, reference, options)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    product.sort_order,
                    product.name,
                    product.price,
                    product.photo,
                    product.category_id,
                    product.description,
                    product.vat_rate,
                    product.stock,
                    product.reference,
                    product.options,
                ]
            );
            insertedCount++;
            log(`✅ Inserted: ${product.name} (${product.category_id}) - stock = ${product.stock}`, 'green');
        }

        log(`\n✨ Sync completed!`, 'green');
        log(`   Inserted: ${insertedCount} products`, 'green');

        await client.end();
    } catch (error) {
        log('\n❌ Sync failed:', 'red');
        console.error(error);
        await client.end();
        process.exit(1);
    }
}

syncProducts();
