#!/usr/bin/env bun
/**
 * Migration script: Google Sheets → Neon PostgreSQL
 *
 * This script fetches data from Google Sheets and migrates it to a PostgreSQL database.
 * It creates the necessary tables and populates them with data from the spreadsheet.
 *
 * Usage: bun run scripts/migrate-sheets-to-postgres.ts
 */

import { Client } from 'pg';

// Environment validation
const requiredEnvVars = ['GOOGLE_API_KEY', 'SHOP_SPREADSHEET_ID', 'PG_HOST', 'PG_USER', 'PG_PASSWORD'];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

// PostgreSQL client configuration
const pgConfig = {
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
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
 * Create databases if they don't exist
 */
async function createDatabases() {
    console.log('🗄️  Creating databases...');

    const adminClient = new Client({ ...pgConfig, database: 'postgres' });
    await adminClient.connect();

    // Check and create DC database
    const dcCheck = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = 'dc'");
    if (dcCheck.rows.length === 0) {
        await adminClient.query('CREATE DATABASE dc');
        console.log('✅ Created dc database');
    } else {
        console.log('ℹ️  dc database already exists');
    }

    // Check and create DC_POS database
    const dcPosCheck = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = 'dc_pos'");
    if (dcPosCheck.rows.length === 0) {
        await adminClient.query('CREATE DATABASE dc_pos');
        console.log('✅ Created dc_pos database');
    } else {
        console.log('ℹ️  dc_pos database already exists');
    }

    // Check and create DC_SYS database
    const dcSysCheck = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = 'dc_sys'");
    if (dcSysCheck.rows.length === 0) {
        await adminClient.query('CREATE DATABASE dc_sys');
        console.log('✅ Created dc_sys database');
    } else {
        console.log('ℹ️  dc_sys database already exists');
    }

    await adminClient.end();
    console.log('');
}

/**
 * Create database schemas
 */
async function createSchema() {
    console.log('📋 Creating database schemas...');

    // Create DC database and tables
    const dcClient = new Client({ ...pgConfig, database: 'dc' });
    await dcClient.connect();

    const dcQueries = [
        // Categories table
        `CREATE TABLE IF NOT EXISTS categorie (
            id VARCHAR(10) NOT NULL PRIMARY KEY,
            nom VARCHAR(50) NOT NULL,
            ordre INTEGER NOT NULL,
            taux_tva_default DECIMAL(5,2) DEFAULT 10.00
        )`,

        // Articles table
        `CREATE TABLE IF NOT EXISTS article (
            id SERIAL PRIMARY KEY,
            ordre INTEGER NOT NULL DEFAULT 0,
            nom VARCHAR(50) NOT NULL DEFAULT '',
            prix DECIMAL(8,2) NOT NULL DEFAULT 0.00,
            photo VARCHAR(50) NOT NULL DEFAULT '',
            disponible INTEGER NOT NULL DEFAULT 1,
            categorie VARCHAR(50) NOT NULL DEFAULT '',
            description VARCHAR(300) DEFAULT '',
            options VARCHAR(1000) DEFAULT '',
            nbr_commandes INTEGER NOT NULL DEFAULT 0,
            taux_tva DECIMAL(5,2) DEFAULT NULL
        )`,

        // Config etablissement
        `CREATE TABLE IF NOT EXISTS config_etablissement (
            id SERIAL PRIMARY KEY,
            mode_fonctionnement VARCHAR(20) NOT NULL DEFAULT 'restaurant',
            delai_orange_minutes INTEGER DEFAULT 5,
            delai_rouge_minutes INTEGER DEFAULT 10,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            last_order_short_number CHAR(3) DEFAULT '0',
            auto_print_kitchen_ticket SMALLINT DEFAULT 0,
            kitchen_printer_id INTEGER DEFAULT NULL,
            kitchen_view_enabled SMALLINT NOT NULL DEFAULT 1,
            grafana_access_enabled SMALLINT NOT NULL DEFAULT 1,
            note_printer_id INTEGER DEFAULT NULL
        )`,

        // Element formule
        `CREATE TABLE IF NOT EXISTS element_formule (
            id VARCHAR(50) NOT NULL DEFAULT '',
            nom VARCHAR(50) NOT NULL,
            id_categorie VARCHAR(50) DEFAULT NULL
        )`,

        // Formule
        `CREATE TABLE IF NOT EXISTS formule (
            id VARCHAR(50) NOT NULL DEFAULT '',
            nom VARCHAR(50) NOT NULL,
            prix DECIMAL(8,2) NOT NULL DEFAULT 0.00,
            ordre INTEGER NOT NULL,
            nbr_commandes INTEGER NOT NULL DEFAULT 0
        )`,

        // Log
        `CREATE TABLE IF NOT EXISTS log (
            id SERIAL PRIMARY KEY,
            severity INTEGER NOT NULL DEFAULT 0,
            ip VARCHAR(50) DEFAULT NULL,
            source VARCHAR(50) NOT NULL,
            data TEXT NOT NULL,
            date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,

        // Mur (walls)
        `CREATE TABLE IF NOT EXISTS mur (
            id SERIAL PRIMARY KEY,
            x1 INTEGER NOT NULL,
            y1 INTEGER NOT NULL,
            x2 INTEGER NOT NULL,
            y2 INTEGER NOT NULL,
            color VARCHAR(50) DEFAULT '#252535'
        )`,

        // Panier (cart/order)
        `CREATE TABLE IF NOT EXISTS panier (
            id SERIAL PRIMARY KEY,
            short_num_order CHAR(3) NOT NULL DEFAULT '0',
            date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            token_notif VARCHAR(200) DEFAULT NULL,
            service_type VARCHAR(20) DEFAULT 'emporter',
            done INTEGER NOT NULL DEFAULT 0,
            paid INTEGER NOT NULL DEFAULT 0,
            given_at TIMESTAMP DEFAULT NULL,
            preparation_started_at TIMESTAMP DEFAULT NULL
        )`,

        // Relation element_formule - article
        `CREATE TABLE IF NOT EXISTS rel_ef_article (
            id_element_formule VARCHAR(50) NOT NULL DEFAULT '',
            id_article INTEGER NOT NULL,
            ordre INTEGER NOT NULL
        )`,

        // Relation element_formule - formule
        `CREATE TABLE IF NOT EXISTS rel_ef_formule (
            id_formule VARCHAR(50) NOT NULL DEFAULT '',
            id_element_formule VARCHAR(50) NOT NULL DEFAULT '',
            ordre INTEGER NOT NULL
        )`,

        // Relation panier - article
        `CREATE TABLE IF NOT EXISTS rel_panier_article (
            panier_id INTEGER NOT NULL DEFAULT 0,
            article_id VARCHAR(16) NOT NULL DEFAULT '',
            quantite INTEGER NOT NULL,
            option VARCHAR(500) DEFAULT NULL,
            checked INTEGER NOT NULL DEFAULT 0,
            kitchen_view INTEGER NOT NULL DEFAULT 0,
            nom_categorie VARCHAR(100) NOT NULL,
            id VARCHAR(32) NOT NULL,
            paid_at TIMESTAMP DEFAULT NULL
        )`,

        // Relation panier - formule
        `CREATE TABLE IF NOT EXISTS rel_panier_formule (
            id SERIAL PRIMARY KEY,
            panier_id INTEGER NOT NULL,
            formule_id VARCHAR(16) NOT NULL,
            quantite INTEGER NOT NULL,
            note VARCHAR(400) DEFAULT '',
            paid_at TIMESTAMP DEFAULT NULL
        )`,

        // Relation panier_formule - element_formule
        `CREATE TABLE IF NOT EXISTS rel_pf_ef (
            id_pf VARCHAR(16) NOT NULL,
            id_ef VARCHAR(16) NOT NULL,
            id_article INTEGER NOT NULL,
            options VARCHAR(1000) DEFAULT NULL,
            checked INTEGER NOT NULL DEFAULT 0,
            kitchen_view INTEGER NOT NULL,
            nom_categorie VARCHAR(100) NOT NULL,
            id VARCHAR(32) NOT NULL,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            preparation_started_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
        )`,

        // Relation table - panier
        `CREATE TABLE IF NOT EXISTS rel_table_panier (
            table_id VARCHAR(16) NOT NULL DEFAULT '',
            panier_id INTEGER NOT NULL DEFAULT 0
        )`,

        // Table
        `CREATE TABLE IF NOT EXISTS "table" (
            id INTEGER NOT NULL PRIMARY KEY,
            state VARCHAR(20) DEFAULT 'ready',
            visible INTEGER NOT NULL DEFAULT 0,
            demande_serv INTEGER NOT NULL DEFAULT 0,
            new_order_notification INTEGER NOT NULL DEFAULT 0,
            qr_data VARCHAR(64) NOT NULL DEFAULT '',
            password3D VARCHAR(3) DEFAULT NULL,
            x INTEGER NOT NULL DEFAULT 0,
            y INTEGER NOT NULL DEFAULT 0,
            nbr_flash INTEGER NOT NULL DEFAULT 0,
            nbr_commandes INTEGER NOT NULL DEFAULT 0,
            nbr_couverts INTEGER DEFAULT NULL,
            code_updated_at TIMESTAMP NULL DEFAULT NULL
        )`,

        // Theme admin
        `CREATE TABLE IF NOT EXISTS theme_admin (
            id SERIAL PRIMARY KEY,
            selected INTEGER NOT NULL DEFAULT 0,
            name VARCHAR(50) NOT NULL DEFAULT 'unnamed',
            text_light VARCHAR(9) NOT NULL,
            text_dark VARCHAR(9) NOT NULL,
            gradient_start_light VARCHAR(9) NOT NULL,
            gradient_start_dark VARCHAR(9) NOT NULL,
            gradient_end_light VARCHAR(9) NOT NULL,
            gradient_end_dark VARCHAR(9) NOT NULL,
            popup_light VARCHAR(9) NOT NULL,
            popup_dark VARCHAR(9) NOT NULL,
            activated_light VARCHAR(9) NOT NULL,
            activated_dark VARCHAR(9) NOT NULL,
            secondary_light VARCHAR(9) NOT NULL,
            secondary_dark VARCHAR(9) NOT NULL,
            secondary_activated_light VARCHAR(9) NOT NULL,
            secondary_activated_dark VARCHAR(9) NOT NULL
        )`,

        // Theme client
        `CREATE TABLE IF NOT EXISTS theme_client (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) NOT NULL DEFAULT 'unnamed',
            primary_text VARCHAR(9) NOT NULL,
            secondary_text VARCHAR(9) NOT NULL,
            background VARCHAR(9) NOT NULL,
            border VARCHAR(9) NOT NULL,
            error VARCHAR(9) NOT NULL,
            success VARCHAR(9) NOT NULL,
            warning VARCHAR(9) NOT NULL,
            is_active SMALLINT NOT NULL DEFAULT 0,
            theme_type VARCHAR(20) NOT NULL DEFAULT 'custom'
        )`,
    ];

    for (const query of dcQueries) {
        await dcClient.query(query);
    }
    await dcClient.end();
    console.log('✅ DC schema created successfully');

    // Create DC_POS database and tables
    const dcPosClient = new Client({ ...pgConfig, database: 'dc_pos' });
    await dcPosClient.connect();

    const dcPosQueries = [
        // Users table (must be created first for foreign keys)
        `CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            key VARCHAR(50) NOT NULL,
            name VARCHAR(100) NOT NULL,
            role VARCHAR(50) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,

        // Currency table
        `CREATE TABLE IF NOT EXISTS currency (
            id SERIAL PRIMARY KEY,
            label VARCHAR(50) NOT NULL,
            symbol VARCHAR(5) NOT NULL,
            max_value DECIMAL(10,4) DEFAULT NULL,
            decimals INTEGER DEFAULT 2,
            rate DECIMAL(10,4) NULL DEFAULT 0.0000,
            fee DECIMAL(3,1) NULL DEFAULT 0.0
        )`,

        // Payment methods table
        `CREATE TABLE IF NOT EXISTS payment_methods (
            id SERIAL PRIMARY KEY,
            label VARCHAR(50) NOT NULL UNIQUE,
            address VARCHAR(255) DEFAULT NULL,
            currency VARCHAR(10) DEFAULT '€',
            hidden SMALLINT DEFAULT 0,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
        )`,

        // Facturation table
        `CREATE TABLE IF NOT EXISTS facturation (
            id SERIAL PRIMARY KEY,
            panier_id VARCHAR(50) NOT NULL,
            user_id INTEGER DEFAULT NULL,
            payment_method_id INTEGER DEFAULT NULL,
            amount FLOAT NOT NULL,
            currency_id INTEGER DEFAULT NULL,
            note VARCHAR(300) DEFAULT NULL,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT facturation_user_fk FOREIGN KEY (user_id) REFERENCES users(id),
            CONSTRAINT facturation_payment_method_fk FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
            CONSTRAINT facturation_currency_fk FOREIGN KEY (currency_id) REFERENCES currency(id)
        )`,

        // Facturation article table
        `CREATE TABLE IF NOT EXISTS facturation_article (
            id SERIAL PRIMARY KEY,
            facturation_id INTEGER NOT NULL,
            article_id INTEGER DEFAULT NULL,
            label VARCHAR(100) DEFAULT NULL,
            category VARCHAR(50) DEFAULT NULL,
            amount FLOAT DEFAULT NULL,
            quantity INTEGER DEFAULT NULL,
            discount_amount FLOAT DEFAULT 0,
            discount_unit VARCHAR(10) DEFAULT '',
            total FLOAT DEFAULT NULL,
            CONSTRAINT facturation_article_fk FOREIGN KEY (facturation_id) REFERENCES facturation(id)
        )`,

        // Parameters table
        `CREATE TABLE IF NOT EXISTS parameters (
            id SERIAL PRIMARY KEY,
            param_key VARCHAR(100) NOT NULL UNIQUE,
            param_value VARCHAR(255) DEFAULT NULL,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
        )`,

        // Printers table
        `CREATE TABLE IF NOT EXISTS printers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            ip_address VARCHAR(50) NOT NULL,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            note_enabled SMALLINT NOT NULL DEFAULT 1
        )`,
    ];

    for (const query of dcPosQueries) {
        await dcPosClient.query(query);
    }
    await dcPosClient.end();
    console.log('✅ DC_POS schema created successfully');

    // Create DC_SYS database and tables
    const dcSysClient = new Client({ ...pgConfig, database: 'dc_sys' });
    await dcSysClient.connect();

    const dcSysQueries = [
        // Log table
        `CREATE TABLE IF NOT EXISTS log (
            id SERIAL PRIMARY KEY,
            severity INTEGER NOT NULL DEFAULT 0,
            ip VARCHAR(50) DEFAULT NULL,
            source VARCHAR(50) NOT NULL,
            data TEXT NOT NULL,
            date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,

        // OTA (Over The Air) table
        `CREATE TABLE IF NOT EXISTS ota (
            table_id INTEGER NOT NULL,
            expiration TIMESTAMP NOT NULL,
            token VARCHAR(64) NOT NULL
        )`,

        // Web token table
        `CREATE TABLE IF NOT EXISTS web_token (
            id SERIAL PRIMARY KEY,
            type VARCHAR(10) NOT NULL,
            generated_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expiration_timestamp TIMESTAMP NULL DEFAULT NULL,
            value TEXT NOT NULL
        )`,
    ];

    for (const query of dcSysQueries) {
        await dcSysClient.query(query);
    }
    await dcSysClient.end();
    console.log('✅ DC_SYS schema created successfully');
}

/**
 * Migrate parameters
 */
async function migrateParameters() {
    console.log('📦 Migrating parameters...');

    const data = await fetchSheetData(SHEETS.PARAMETERS);
    if (data.error || !data.values?.length) {
        console.warn('⚠️  No parameters data found');
        return;
    }

    const client = new Client({ ...pgConfig, database: 'dc_pos' });
    await client.connect();

    // Clear existing data
    await client.query('DELETE FROM parameters');

    // Parameters are stored as key-value pairs
    const parameterMapping: { [key: string]: number } = {
        name: 0,
        address: 1,
        zipCode: 2,
        city: 3,
        serial: 4,
        id: 5,
        email: 6,
        thanksMessage: 7,
        mercurial: 8,
        closingHour: 9,
        yearStartDate: 10,
        lastModified: 11,
    };

    for (const [key, index] of Object.entries(parameterMapping)) {
        if (data.values[index]) {
            const value = data.values[index][1] || data.values[index][0];
            await client.query(
                'INSERT INTO parameters (param_key, param_value) VALUES ($1, $2) ON CONFLICT (param_key) DO UPDATE SET param_value = $2',
                [key, String(value)]
            );
        }
    }

    await client.end();
    console.log(`✅ Migrated ${Object.keys(parameterMapping).length} parameters`);
}

/**
 * Migrate currencies
 */
async function migrateCurrencies() {
    console.log('💱 Migrating currencies...');

    const data = await fetchSheetData(SHEETS.CURRENCIES);
    if (data.error || !data.values?.length) {
        console.warn('⚠️  No currencies data found');
        return;
    }

    const client = new Client({ ...pgConfig, database: 'dc_pos' });
    await client.connect();

    // Clear existing data
    await client.query('DELETE FROM currency');

    // Skip header row
    const rows = data.values.slice(1);
    let count = 0;

    for (const row of rows) {
        if (row.length >= 4) {
            const label = String(row[0]).trim();
            const maxValue = Number(row[1]) || 999.99;
            const symbol = String(row[2]).trim();
            const decimals = Number(row[3]) || 2;
            const rate = row.length > 4 ? Number(row[4]) || 1 : 1;
            const fee = row.length > 5 ? Number(row[5]) || 0 : 0;

            await client.query(
                'INSERT INTO currency (label, symbol, max_value, decimals, rate, fee) VALUES ($1, $2, $3, $4, $5, $6)',
                [label, symbol, maxValue, decimals, rate, fee]
            );
            count++;
        }
    }

    await client.end();
    console.log(`✅ Migrated ${count} currencies`);
}

/**
 * Migrate payment methods
 */
async function migratePaymentMethods() {
    console.log('💳 Migrating payment methods...');

    const data = await fetchSheetData(SHEETS.PAYMENT_METHODS);
    if (data.error || !data.values?.length) {
        console.warn('⚠️  No payment methods data found');
        return;
    }

    const client = new Client({ ...pgConfig, database: 'dc_pos' });
    await client.connect();

    // Clear existing data
    await client.query('DELETE FROM payment_methods');

    // Skip header row
    const rows = data.values.slice(1);
    let count = 0;

    for (const row of rows) {
        if (row.length >= 4) {
            const label = String(row[0]).trim();
            const address = String(row[1]).trim();
            const currency = String(row[2]).trim();
            const hidden = row[3] ? 1 : 0;

            await client.query(
                'INSERT INTO payment_methods (label, address, currency, hidden) VALUES ($1, $2, $3, $4)',
                [label, address, currency, hidden]
            );
            count++;
        }
    }

    await client.end();
    console.log(`✅ Migrated ${count} payment methods`);
}

/**
 * Migrate printers
 */
async function migratePrinters() {
    console.log('🖨️  Migrating printers...');

    const data = await fetchSheetData(SHEETS.PRINTERS);
    if (data.error || !data.values?.length) {
        console.log('ℹ️  No printers data found (optional)');
        return;
    }

    const client = new Client({ ...pgConfig, database: 'dc_pos' });
    await client.connect();

    // Clear existing data
    await client.query('DELETE FROM printers');

    // Skip header row
    const rows = data.values.slice(1);
    let count = 0;

    for (const row of rows) {
        if (row.length >= 2) {
            const name = String(row[0]).trim();
            const ipAddress = String(row[1]).trim();

            await client.query('INSERT INTO printers (name, ip_address, note_enabled) VALUES ($1, $2, 1)', [
                name,
                ipAddress,
            ]);
            count++;
        }
    }

    await client.end();
    console.log(`✅ Migrated ${count} printers`);
}

/**
 * Migrate users
 */
async function migrateUsers() {
    console.log('👥 Migrating users...');

    const data = await fetchSheetData(SHEETS.USERS);
    if (data.error || !data.values?.length) {
        console.log('ℹ️  No users data found (optional)');
        return;
    }

    const client = new Client({ ...pgConfig, database: 'dc_pos' });
    await client.connect();

    // Clear existing data
    await client.query('DELETE FROM users');

    // Skip header row
    const rows = data.values.slice(1);
    let count = 0;

    for (const row of rows) {
        if (row.length >= 3) {
            const key = String(row[0]).trim();
            const name = String(row[1]).trim();
            const role = String(row[2]).trim();

            await client.query('INSERT INTO users (key, name, role) VALUES ($1, $2, $3)', [key, name, role]);
            count++;
        }
    }

    await client.end();
    console.log(`✅ Migrated ${count} users`);
}

/**
 * Migrate colors/theme
 */
async function migrateColors() {
    console.log('🎨 Migrating colors/theme...');

    const data = await fetchSheetData(SHEETS.COLORS);
    if (data.error || !data.values?.length) {
        console.log('ℹ️  No colors data found (optional)');
        return;
    }

    const client = new Client({ ...pgConfig, database: 'dc' });
    await client.connect();

    // Clear existing data
    await client.query('DELETE FROM theme_admin');

    // Skip header row
    const rows = data.values.slice(1);

    if (rows.length >= 7) {
        // Expected rows: Texte, Fond début dégradé, Fond fin dégradé, Popup, Activé, Secondaire, Secondaire activé
        await client.query(
            `INSERT INTO theme_admin (
                selected,
                name,
                text_light, text_dark,
                gradient_start_light, gradient_start_dark,
                gradient_end_light, gradient_end_dark,
                popup_light, popup_dark,
                activated_light, activated_dark,
                secondary_light, secondary_dark,
                secondary_activated_light, secondary_activated_dark
            ) VALUES (
                1,
                'Tradiz Theme',
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            )`,
            [
                String(rows[0][1]),
                String(rows[0][2]), // text
                String(rows[1][1]),
                String(rows[1][2]), // gradient_start
                String(rows[2][1]),
                String(rows[2][2]), // gradient_end
                String(rows[3][1]),
                String(rows[3][2]), // popup
                String(rows[4][1]),
                String(rows[4][2]), // activated
                String(rows[5][1]),
                String(rows[5][2]), // secondary
                String(rows[6][1]),
                String(rows[6][2]), // secondary_activated
            ]
        );

        console.log('✅ Migrated theme colors');
    }

    await client.end();
}

/**
 * Migrate products (categories and articles)
 */
async function migrateProducts() {
    console.log('📦 Migrating products...');

    const data = await fetchSheetData(SHEETS.PRODUCTS);
    if (data.error || !data.values?.length) {
        console.warn('⚠️  No products data found');
        return;
    }

    const client = new Client({ ...pgConfig, database: 'dc' });
    await client.connect();

    // Clear existing data
    await client.query('DELETE FROM article');
    await client.query('DELETE FROM categorie');

    // Skip header row
    const rows = data.values.slice(1);
    const categories = new Map<string, string>();
    let articleCount = 0;
    let categoryOrder = 0;

    for (const row of rows) {
        if (row.length >= 4) {
            const rate = Number(row[0]) * 100 || 10; // Convert to percentage (0.1 -> 10)
            const category = String(row[1]).trim();
            const label = String(row[2]).trim();
            const unavailable = Boolean(row[3]);
            const price = row.length > 4 ? Number(row[4]) : 0;

            // Skip empty rows
            if (!category || !label) continue;

            // Create category if it doesn't exist
            if (!categories.has(category)) {
                // Generate a simple ID for the category (cat1, cat2, etc.)
                const categoryId = `cat${categoryOrder + 1}`;
                await client.query('INSERT INTO categorie (id, nom, ordre, taux_tva_default) VALUES ($1, $2, $3, $4)', [
                    categoryId,
                    category,
                    categoryOrder,
                    rate,
                ]);
                categories.set(category, categoryId);
                categoryOrder++;
            }

            const categoryId = categories.get(category);

            // Insert article
            await client.query(
                'INSERT INTO article (ordre, nom, prix, taux_tva, categorie, options, disponible) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [articleCount, label, price, rate, categoryId, null, unavailable ? 0 : 1]
            );
            articleCount++;
        }
    }

    await client.end();
    console.log(`✅ Migrated ${categories.size} categories and ${articleCount} articles`);
}

/**
 * Main migration function
 */
async function main() {
    console.log('🚀 Starting migration from Google Sheets to PostgreSQL...\n');

    try {
        // Test connection
        console.log('🔌 Testing PostgreSQL connection...');
        const testClient = new Client({ ...pgConfig, database: 'postgres' });
        await testClient.connect();
        await testClient.end();
        console.log('✅ Connected to PostgreSQL\n');

        // Create databases
        await createDatabases();

        // Create schema
        await createSchema();
        console.log('');

        // Migrate data
        await migrateParameters();
        await migrateCurrencies();
        await migratePaymentMethods();
        await migratePrinters();
        await migrateUsers();
        await migrateColors();
        await migrateProducts();

        console.log('\n✨ Migration completed successfully!');
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
main();
