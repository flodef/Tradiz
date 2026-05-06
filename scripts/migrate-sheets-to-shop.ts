#!/usr/bin/env bun
/**
 * Migration script: Google Sheets → PostgreSQL (Shop-based structure)
 *
 * This script fetches data from Google Sheets and migrates it to a PostgreSQL database
 * using the shop-based structure (schemas within one database).
 *
 * Usage: bun run scripts/migrate-sheets-to-shop.ts
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
    database: SHOP_NAME, // Use shop database
    ssl: { rejectUnauthorized: false }, // Required for Neon
};

// Sheet names mapping
const SHEETS = {
    PARAMETERS: 'Paramètres',
    PAYMENT_METHODS: 'Paiements',
    CURRENCIES: '_Monnaies',
    DISCOUNTS: 'Remises',
    COLORS: 'Couleurs',
    PRINTERS: 'Imprimantes',
    PRODUCTS: '_Produits',
    USERS: 'Utilisateurs',
} as const;

interface SheetData {
    values?: (string | number | boolean)[][];
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
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error fetching sheet "${sheetName}":`, error);
        return { error: { message: String(error) } };
    }
}

/**
 * Migrate parameters
 */
async function migrateParameters(client: Client) {
    console.log('📦 Migrating parameters...');

    const data = await fetchSheetData(SHEETS.PARAMETERS);
    if (data.error || !data.values || data.values.length < 2) {
        console.log('ℹ️  No parameters data found');
        return;
    }

    // Clear existing parameters
    await client.query('DELETE FROM dc_pos.parameters');

    // Skip header row and insert parameters
    let count = 0;
    let hasShopName = false;

    for (let i = 1; i < data.values.length; i++) {
        const row = data.values[i];
        if (row.length >= 2) {
            const key = String(row[0]).trim();
            let value = String(row[1]).trim();

            // Track if shop name exists
            if (key === 'name' || key === 'Nom du commerce') {
                hasShopName = true;
            }

            // Fix closingHour: extract hour (0-23) from datetime or time string
            if ((key === 'closingHour' || key === 'Heure de fermeture') && value) {
                // Check if it's an Excel serial date (number > 1000)
                const numValue = Number(value);
                if (!isNaN(numValue) && numValue > 1000) {
                    // Excel serial date - convert to hours (fractional part * 24)
                    const fractionalDay = numValue - Math.floor(numValue);
                    value = String(Math.floor(fractionalDay * 24));
                } else {
                    // Try to extract hour from time/datetime (e.g., "18:00:00" or "2000-01-01 18:00:00" -> "18")
                    const hourMatch = value.match(/(\d{1,2}):/);
                    if (hourMatch) {
                        value = hourMatch[1];
                    } else if (!isNaN(numValue) && numValue < 24) {
                        // If it's already a valid hour number (0-23), keep it
                        value = String(Math.floor(numValue));
                    } else {
                        // Default to 0 if we can't parse it
                        value = '0';
                    }
                }
            }

            if (key) {
                await client.query('INSERT INTO dc_pos.parameters (param_key, param_value) VALUES ($1, $2)', [
                    key,
                    value,
                ]);
                count++;
            }
        }
    }

    // Add shop name if not present in spreadsheet
    if (!hasShopName && SHOP_NAME) {
        await client.query('INSERT INTO dc_pos.parameters (param_key, param_value) VALUES ($1, $2)', [
            'Nom du commerce',
            SHOP_NAME,
        ]);
        count++;
        console.log(`  ℹ️  Added shop name from environment: ${SHOP_NAME}`);
    }

    console.log(`✅ Migrated ${count} parameters`);
}

/**
 * Migrate currencies
 */
async function migrateCurrencies(client: Client) {
    console.log('💱 Migrating currencies...');

    const data = await fetchSheetData(SHEETS.CURRENCIES);
    if (data.error || !data.values || data.values.length < 2) {
        console.log('ℹ️  No currencies data found');
        return;
    }

    // Clear existing currencies
    await client.query('DELETE FROM dc_pos.currency');

    // Skip header row and insert currencies
    let count = 0;
    for (let i = 1; i < data.values.length; i++) {
        const row = data.values[i];
        if (row.length >= 3) {
            const label = String(row[0]).trim();
            const symbol = String(row[2]).trim();

            if (label && symbol) {
                await client.query('INSERT INTO dc_pos.currency (label, symbol) VALUES ($1, $2)', [label, symbol]);
                count++;
            }
        }
    }

    console.log(`✅ Migrated ${count} currencies`);
}

/**
 * Migrate payment methods
 */
async function migratePaymentMethods(client: Client) {
    console.log('💳 Migrating payment methods...');

    const data = await fetchSheetData(SHEETS.PAYMENT_METHODS);
    if (data.error || !data.values || data.values.length < 2) {
        console.log('ℹ️  No payment methods data found');
        return;
    }

    // Clear existing payment methods
    await client.query('DELETE FROM dc_pos.payment_methods');

    // Skip header row and insert payment methods
    let count = 0;
    for (let i = 1; i < data.values.length; i++) {
        const row = data.values[i];
        if (row.length >= 4) {
            const label = String(row[0]).trim();
            const address = String(row[1]).trim();
            const currency = String(row[2]).trim();
            const availability = Boolean(row[3]);
            const hidden = !availability; // Invert: availability true = hidden false

            if (label) {
                await client.query(
                    'INSERT INTO dc_pos.payment_methods (label, address, currency, hidden) VALUES ($1, $2, $3, $4)',
                    [label, address, currency, hidden]
                );
                count++;
            }
        }
    }

    console.log(`✅ Migrated ${count} payment methods`);
}

/**
 * Migrate printers
 */
async function migratePrinters(client: Client) {
    console.log('🖨️  Migrating printers...');

    const data = await fetchSheetData(SHEETS.PRINTERS);
    if (data.error || !data.values || data.values.length < 2) {
        console.log('ℹ️  No printers data found (optional)');
        return;
    }

    // Clear existing printers
    await client.query('DELETE FROM dc_pos.printers');

    // Skip header row and insert printers
    let count = 0;
    for (let i = 1; i < data.values.length; i++) {
        const row = data.values[i];
        if (row.length >= 2) {
            const name = String(row[0]).trim();
            const ipAddress = String(row[1]).trim();

            if (name && ipAddress) {
                await client.query('INSERT INTO dc_pos.printers (name, ip_address) VALUES ($1, $2)', [name, ipAddress]);
                count++;
            }
        }
    }

    console.log(`✅ Migrated ${count} printers`);
}

/**
 * Migrate users
 */
async function migrateUsers(client: Client) {
    console.log('👥 Migrating users...');

    const data = await fetchSheetData(SHEETS.USERS);
    if (data.error || !data.values || data.values.length < 2) {
        console.log('ℹ️  No users data found in spreadsheet - keeping existing users');
        return;
    }

    // Clear existing users
    await client.query('DELETE FROM dc_pos.users');

    // Skip header row and insert users
    let count = 0;
    for (let i = 1; i < data.values.length; i++) {
        const row = data.values[i];
        if (row.length >= 3) {
            const key = String(row[0]).trim();
            const name = String(row[1]).trim();
            const role = String(row[2]).trim();

            if (key && name && role) {
                await client.query('INSERT INTO dc_pos.users (key, name, role) VALUES ($1, $2, $3)', [key, name, role]);
                count++;
            }
        }
    }

    console.log(`✅ Migrated ${count} users`);
}

/**
 * Migrate theme colors
 */
async function migrateColors(client: Client) {
    console.log('🎨 Migrating colors/theme...');

    const data = await fetchSheetData(SHEETS.COLORS);
    if (data.error || !data.values || data.values.length < 2) {
        console.log('ℹ️  No colors data found');
        return;
    }

    // Clear existing theme
    await client.query('DELETE FROM dc.theme_admin');

    // Parse color data (assuming format: [Label, Light, Dark])
    const colorMap: Record<string, { light: string; dark: string }> = {};
    for (let i = 1; i < data.values.length; i++) {
        const row: (string | number | boolean)[] = data.values[i];
        if (row.length >= 3) {
            const label = String(row[0]).trim().toLowerCase().replace(/\s+/g, '_');
            const light = String(row[1]).trim();
            const dark = String(row[2]).trim();
            colorMap[label] = { light, dark };
        }
    }

    // Insert theme with all colors
    await client.query(
        `INSERT INTO dc.theme_admin (
            selected,
            text_light, text_dark,
            gradient_start_light, gradient_start_dark,
            gradient_end_light, gradient_end_dark,
            popup_light, popup_dark,
            activated_light, activated_dark,
            secondary_light, secondary_dark,
            secondary_activated_light, secondary_activated_dark
        ) VALUES (
            true,
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )`,
        [
            colorMap.texte?.light || '#000000',
            colorMap.texte?.dark || '#FFFFFF',
            colorMap.fond_début_dégradé?.light || '#FFFFFF',
            colorMap.fond_début_dégradé?.dark || '#1A1A2E',
            colorMap.fond_fin_dégradé?.light || '#F0F0F0',
            colorMap.fond_fin_dégradé?.dark || '#16213E',
            colorMap.popup?.light || '#FFFFFF',
            colorMap.popup?.dark || '#1A1A2E',
            colorMap.activé?.light || '#E0E0E0',
            colorMap.activé?.dark || '#2A2A4A',
            colorMap.secondaire?.light || '#4A90D9',
            colorMap.secondaire?.dark || '#6AB0FF',
            colorMap.secondaire_activé?.light || '#357ABD',
            colorMap.secondaire_activé?.dark || '#4A90D9',
        ]
    );

    console.log('✅ Migrated theme colors');
}

/**
 * Migrate products (categories and articles)
 * Format from spreadsheet: [rate, category, label, unavailable, ...prices]
 */
async function migrateProducts(client: Client) {
    console.log('📦 Migrating products...');

    const data = await fetchSheetData(SHEETS.PRODUCTS);
    if (data.error || !data.values || data.values.length < 2) {
        console.log('ℹ️  No products data found');
        return;
    }

    // Clear existing data
    await client.query('DELETE FROM dc.article');
    await client.query('DELETE FROM dc.categorie');

    const categories = new Map<string, { nom: string; ordre: number }>();
    const articles: Array<{
        ordre: number;
        nom: string;
        prix: number;
        photo: string;
        disponible: number;
        categorie: string;
        taux_tva: number;
        description: string;
        options: string;
    }> = [];

    // Parse products data (skip header row)
    const rowsAfterHeader = data.values.slice(1);
    const optionsArr = (data as { options?: (string | null)[] }).options ?? [];

    // Filter out empty rows
    const filtered = rowsAfterHeader
        .map((item, origIdx) => ({ item, origIdx }))
        .filter(({ item }) => item[1] != null && String(item[1]).trim() !== '') // category not empty
        .filter(({ item }) => item[2] != null && String(item[2]).trim() !== ''); // label not empty

    let ordre = 0;
    for (const { item: row, origIdx } of filtered) {
        if (row.length >= 4) {
            const taux_tva = Number(row[0]) || 0.1; // Default 10% if not specified
            const categorie = String(row[1]).trim();
            const nom = String(row[2]).trim();
            const unavailable = row[3]; // true/false or 1/0
            const disponible = unavailable ? 0 : 1; // Invert: unavailable -> disponible
            const prix = Number(row[4]) || 0; // First price (Euro)
            const options = optionsArr[origIdx] ?? '';

            if (nom && categorie) {
                // Track category
                if (!categories.has(categorie)) {
                    categories.set(categorie, {
                        nom: categorie,
                        ordre: categories.size + 1,
                    });
                }

                // Add article
                articles.push({
                    ordre: ++ordre,
                    nom,
                    prix,
                    photo: '', // No photo in spreadsheet
                    disponible,
                    categorie,
                    taux_tva,
                    description: '', // No description in spreadsheet
                    options: String(options || ''),
                });
            }
        }
    }

    // Insert categories
    let catCount = 0;
    for (const [id, cat] of categories) {
        await client.query('INSERT INTO dc.categorie (id, nom, ordre) VALUES ($1, $2, $3)', [id, cat.nom, cat.ordre]);
        catCount++;
    }

    // Insert articles
    let artCount = 0;
    for (const article of articles) {
        await client.query(
            `INSERT INTO dc.article (
                ordre, nom, prix, photo, disponible, categorie, taux_tva, description, options
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                article.ordre,
                article.nom,
                article.prix,
                article.photo,
                article.disponible,
                article.categorie,
                article.taux_tva,
                article.description,
                article.options,
            ]
        );
        artCount++;
    }

    console.log(`✅ Migrated ${catCount} categories and ${artCount} articles`);
}

/**
 * Main migration function
 */
async function main() {
    console.log('🚀 Starting migration from Google Sheets to PostgreSQL...\n');

    const client = new Client(pgConfig);

    try {
        console.log('🔌 Testing PostgreSQL connection...');
        await client.connect();
        console.log(`✅ Connected to database: ${SHOP_NAME}\n`);

        // Run migrations
        await migrateParameters(client);
        await migrateCurrencies(client);
        await migratePaymentMethods(client);
        await migratePrinters(client);
        await migrateUsers(client);
        await migrateColors(client);
        await migrateProducts(client);

        console.log('\n✨ Migration completed successfully!');
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        throw error;
    } finally {
        await client.end();
    }
}

main().catch(console.error);
