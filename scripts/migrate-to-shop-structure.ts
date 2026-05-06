/**
 * Migrate to Shop-Based Database Structure
 *
 * This script migrates existing databases (dc, dc_pos, dc_sys) to a new
 * shop-based structure with schemas.
 *
 * Usage:
 *   bun run scripts/migrate-to-shop-structure.ts
 */

import 'dotenv/config';
import { Pool } from 'pg';
import * as readline from 'readline';
import * as fs from 'fs';

// Colors for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function main() {
    log('\n🚀 Migrate to Shop-Based Database Structure\n', 'green');

    // Get shop name
    const shopName = await prompt('Enter shop name (e.g., "annette"): ');
    if (!shopName) {
        log('❌ ERROR: Shop name cannot be empty', 'red');
        process.exit(1);
    }

    log(`\n   Shop name: ${shopName}\n`, 'yellow');

    // Check DATABASE connection parameters
    if (!process.env.PG_HOST || !process.env.PG_USER || !process.env.PG_PASSWORD) {
        log('❌ ERROR: Database connection parameters not found in environment', 'red');
        log('Please add them to your .env.local file', 'yellow');
        process.exit(1);
    }

    // Build connection config from environment variables
    const baseConfig = {
        host: process.env.PG_HOST,
        port: parseInt(process.env.PG_PORT || '5432'),
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        ssl: { rejectUnauthorized: false },
    };

    // Step 1: Create new database
    log('📦 Step 1: Creating database...', 'green');
    const adminPool = new Pool({
        ...baseConfig,
        database: 'postgres', // Always use postgres system database for admin operations
    });

    try {
        await adminPool.query(`CREATE DATABASE ${shopName}`);
        log(`   ✅ Database "${shopName}" created`, 'green');
    } catch (err) {
        const error = err as { code?: string };
        if (error.code === '42P04') {
            log(`   ⚠️  Database "${shopName}" already exists, continuing...`, 'yellow');
        } else {
            throw err;
        }
    }

    // Step 2: Create schemas
    log('\n📂 Step 2: Creating schemas...', 'green');
    const shopPool = new Pool({
        ...baseConfig,
        database: shopName,
    });

    await shopPool.query('CREATE SCHEMA IF NOT EXISTS dc');
    await shopPool.query('CREATE SCHEMA IF NOT EXISTS dc_pos');
    await shopPool.query('CREATE SCHEMA IF NOT EXISTS dc_sys');
    log('   ✅ Schemas created: dc, dc_pos, dc_sys', 'green');

    // Step 3: Create table structure
    log('\n🏗️  Step 3: Creating table structure...', 'green');

    try {
        const sqlScript = fs.readFileSync('scripts/create-shop-database.sql', 'utf-8');

        // Remove the CREATE DATABASE and \c commands, keep only table definitions
        const tableDefinitions = sqlScript
            .split('\n')
            .filter((line) => !line.includes('CREATE DATABASE') && !line.includes('\\c'))
            .join('\n');

        await shopPool.query(tableDefinitions);
        log('   ✅ Table structure created', 'green');
    } catch (err) {
        const error = err as { code?: string };
        if (error.code === '42P07') {
            log('   ⚠️  Tables already exist, continuing...', 'yellow');
        } else {
            throw err;
        }
    }

    // Step 4: Migrate data from dc_pos
    log('\n📥 Step 4: Migrating data from dc_pos...', 'green');

    // Check if dc_pos schema already has data
    const dcPosCheck = await shopPool.query('SELECT COUNT(*) FROM dc_pos.facturation');
    if (parseInt(dcPosCheck.rows[0].count) > 0) {
        log('   ⏭️  dc_pos schema already has data, skipping entire migration...', 'yellow');
    } else {
        try {
            // Check if dc_pos database exists
            const dbCheck = await adminPool.query(`SELECT 1 FROM pg_database WHERE datname = 'dc_pos'`);

            if (dbCheck.rows.length > 0) {
                const dcPosPool = new Pool({
                    ...baseConfig,
                    database: 'dc_pos',
                });

                // Migrate users
                const users = await dcPosPool.query('SELECT * FROM users');
                if (users.rows.length > 0) {
                    for (const user of users.rows) {
                        await shopPool.query(
                            `INSERT INTO dc_pos.users (id, key, name, role, created_at) 
                             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
                            [user.id, user.key, user.name, user.role, user.created_at]
                        );
                    }
                    log(`   ✅ Migrated ${users.rows.length} users`, 'green');
                }

                // Migrate payment_methods
                const paymentMethods = await dcPosPool.query('SELECT * FROM payment_methods');
                if (paymentMethods.rows.length > 0) {
                    for (const pm of paymentMethods.rows) {
                        await shopPool.query(
                            `INSERT INTO dc_pos.payment_methods (id, label, address, currency, hidden, created_at) 
                         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
                            [pm.id, pm.label, pm.address, pm.currency, pm.hidden, pm.created_at]
                        );
                    }
                    log(`   ✅ Migrated ${paymentMethods.rows.length} payment methods`, 'green');
                }

                // Migrate facturation
                const facturation = await dcPosPool.query('SELECT * FROM facturation');
                if (facturation.rows.length > 0) {
                    for (const f of facturation.rows) {
                        await shopPool.query(
                            `INSERT INTO dc_pos.facturation (id, panier_id, user_id, payment_method_id, amount, currency_id, note, created_at, updated_at) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
                            [
                                f.id,
                                f.panier_id,
                                f.user_id,
                                f.payment_method_id,
                                f.amount,
                                f.currency_id,
                                f.note,
                                f.created_at,
                                f.updated_at,
                            ]
                        );
                    }
                    log(`   ✅ Migrated ${facturation.rows.length} transactions`, 'green');
                }

                // Migrate facturation_article
                const articles = await dcPosPool.query('SELECT * FROM facturation_article');
                if (articles.rows.length > 0) {
                    for (const a of articles.rows) {
                        await shopPool.query(
                            `INSERT INTO dc_pos.facturation_article (id, facturation_id, label, category, amount, quantity, discount_amount, discount_unit, total) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
                            [
                                a.id,
                                a.facturation_id,
                                a.label,
                                a.category,
                                a.amount,
                                a.quantity,
                                a.discount_amount,
                                a.discount_unit,
                                a.total,
                            ]
                        );
                    }
                    log(`   ✅ Migrated ${articles.rows.length} transaction articles`, 'green');
                }

                // Migrate parameters
                const params = await dcPosPool.query('SELECT * FROM parameters');
                if (params.rows.length > 0) {
                    for (const p of params.rows) {
                        // Fix closingHour if it's stored as a date/time
                        let paramValue = p.param_value;
                        if (p.param_key === 'closingHour' && paramValue) {
                            // Extract hour from time/datetime string (e.g., "2000-01-01 18:00:00" -> "18")
                            const hourMatch = String(paramValue).match(/(\d{1,2}):/);
                            if (hourMatch) {
                                paramValue = hourMatch[1];
                            }
                        }

                        await shopPool.query(
                            `INSERT INTO dc_pos.parameters (id, param_key, param_value) 
                             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                            [p.id, p.param_key, paramValue]
                        );
                    }
                    log(`   ✅ Migrated ${params.rows.length} parameters`, 'green');
                }

                // Migrate currencies
                try {
                    const currencies = await dcPosPool.query('SELECT * FROM currency');
                    if (currencies.rows.length > 0) {
                        for (const c of currencies.rows) {
                            await shopPool.query(
                                `INSERT INTO dc_pos.currency (id, label, symbol, created_at) 
                                 VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
                                [c.id, c.label, c.symbol, c.created_at]
                            );
                        }
                        log(`   ✅ Migrated ${currencies.rows.length} currencies`, 'green');
                    }
                } catch {
                    log('   ⚠️  Currency table not found or empty', 'yellow');
                }

                await dcPosPool.end();
            } else {
                log('   ⚠️  dc_pos database not found, skipping', 'yellow');
            }
        } catch (err) {
            const error = err as { code?: string; message?: string };
            if (error.code === '3D000') {
                log('   ⚠️  dc_pos database not found, skipping', 'yellow');
            } else {
                log(`   ⚠️  Error migrating dc_pos: ${error.message || 'Unknown error'}`, 'yellow');
            }
        }
    }

    // Step 5: Migrate data from dc
    log('\n📥 Step 5: Migrating data from dc...', 'green');

    // Check if dc schema already has data
    const dcCheck = await shopPool.query('SELECT COUNT(*) FROM dc.article');
    if (parseInt(dcCheck.rows[0].count) > 0) {
        log('   ⏭️  dc schema already has data, skipping entire migration...', 'yellow');
    } else {
        try {
            const dbCheck = await adminPool.query(`SELECT 1 FROM pg_database WHERE datname = 'dc'`);

            if (dbCheck.rows.length > 0) {
                const dcPool = new Pool({
                    ...baseConfig,
                    database: 'dc',
                });

                // Migrate config_etablissement
                const config = await dcPool.query('SELECT * FROM config_etablissement');
                if (config.rows.length > 0) {
                    for (const c of config.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.config_etablissement (id, mode_fonctionnement, kitchen_view_enabled, grafana_access_enabled) 
                         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
                            [c.id, c.mode_fonctionnement, c.kitchen_view_enabled, c.grafana_access_enabled]
                        );
                    }
                    log(`   ✅ Migrated ${config.rows.length} config records`, 'green');
                }

                // Migrate categorie
                const categories = await dcPool.query('SELECT * FROM categorie');
                if (categories.rows.length > 0) {
                    for (const cat of categories.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.categorie (id, nom, ordre) 
                         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                            [cat.id, cat.nom, cat.ordre]
                        );
                    }
                    log(`   ✅ Migrated ${categories.rows.length} categories`, 'green');
                }

                // Migrate article
                const articles = await dcPool.query('SELECT * FROM article');
                if (articles.rows.length > 0) {
                    for (const art of articles.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.article (id, ordre, nom, prix, photo, disponible, categorie, description, options, nbr_commandes, taux_tva) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT DO NOTHING`,
                            [
                                art.id,
                                art.ordre,
                                art.nom,
                                art.prix,
                                art.photo,
                                art.disponible,
                                art.categorie,
                                art.description,
                                art.options,
                                art.nbr_commandes,
                                art.taux_tva,
                            ]
                        );
                    }
                    log(`   ✅ Migrated ${articles.rows.length} articles`, 'green');
                }

                // Migrate formule
                const formules = await dcPool.query('SELECT * FROM formule');
                if (formules.rows.length > 0) {
                    for (const f of formules.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.formule (id, nom, prix, ordre) 
                         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
                            [f.id, f.nom, f.prix, f.ordre]
                        );
                    }
                    log(`   ✅ Migrated ${formules.rows.length} formules`, 'green');
                }

                // Migrate element_formule
                const elements = await dcPool.query('SELECT * FROM element_formule');
                if (elements.rows.length > 0) {
                    for (const el of elements.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.element_formule (id, nom) 
                         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                            [el.id, el.nom]
                        );
                    }
                    log(`   ✅ Migrated ${elements.rows.length} formula elements`, 'green');
                }

                // Migrate rel_ef_formule
                const relEfFormule = await dcPool.query('SELECT * FROM rel_ef_formule');
                if (relEfFormule.rows.length > 0) {
                    for (const rel of relEfFormule.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.rel_ef_formule (id, id_formule, id_element_formule, ordre) 
                         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
                            [rel.id, rel.id_formule, rel.id_element_formule, rel.ordre]
                        );
                    }
                    log(`   ✅ Migrated ${relEfFormule.rows.length} formula-element relations`, 'green');
                }

                // Migrate rel_ef_article
                const relEfArticle = await dcPool.query('SELECT * FROM rel_ef_article');
                if (relEfArticle.rows.length > 0) {
                    for (const rel of relEfArticle.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.rel_ef_article (id, id_element_formule, id_article, ordre) 
                         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
                            [rel.id, rel.id_element_formule, rel.id_article, rel.ordre]
                        );
                    }
                    log(`   ✅ Migrated ${relEfArticle.rows.length} element-article relations`, 'green');
                }

                // Migrate panier
                const paniers = await dcPool.query('SELECT * FROM panier');
                if (paniers.rows.length > 0) {
                    for (const p of paniers.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.panier (id, short_num_order, service_type, paid, preparation_started_at, created_at) 
                         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
                            [p.id, p.short_num_order, p.service_type, p.paid, p.preparation_started_at, p.created_at]
                        );
                    }
                    log(`   ✅ Migrated ${paniers.rows.length} orders (panier)`, 'green');
                }

                // Migrate rel_panier_article
                const relPanierArticle = await dcPool.query('SELECT * FROM rel_panier_article');
                if (relPanierArticle.rows.length > 0) {
                    for (const rel of relPanierArticle.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.rel_panier_article (id, panier_id, article_id, quantite, nom_categorie, option, paid_at, kitchen_view) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
                            [
                                rel.id,
                                rel.panier_id,
                                rel.article_id,
                                rel.quantite,
                                rel.nom_categorie,
                                rel.option,
                                rel.paid_at,
                                rel.kitchen_view,
                            ]
                        );
                    }
                    log(`   ✅ Migrated ${relPanierArticle.rows.length} order-article relations`, 'green');
                }

                // Migrate rel_panier_formule
                const relPanierFormule = await dcPool.query('SELECT * FROM rel_panier_formule');
                if (relPanierFormule.rows.length > 0) {
                    for (const rel of relPanierFormule.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.rel_panier_formule (id, panier_id, formule_id, quantite, note, paid_at) 
                         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
                            [rel.id, rel.panier_id, rel.formule_id, rel.quantite, rel.note, rel.paid_at]
                        );
                    }
                    log(`   ✅ Migrated ${relPanierFormule.rows.length} order-formula relations`, 'green');
                }

                // Migrate rel_pf_ef
                const relPfEf = await dcPool.query('SELECT * FROM rel_pf_ef');
                if (relPfEf.rows.length > 0) {
                    for (const rel of relPfEf.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.rel_pf_ef (id, id_pf, id_ef, id_article, nom_categorie, options, kitchen_view) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
                            [
                                rel.id,
                                rel.id_pf,
                                rel.id_ef,
                                rel.id_article,
                                rel.nom_categorie,
                                rel.options,
                                rel.kitchen_view,
                            ]
                        );
                    }
                    log(`   ✅ Migrated ${relPfEf.rows.length} formula-element-article relations`, 'green');
                }

                // Migrate theme_admin
                const themes = await dcPool.query('SELECT * FROM theme_admin');
                if (themes.rows.length > 0) {
                    for (const t of themes.rows) {
                        await shopPool.query(
                            `INSERT INTO dc.theme_admin (id, selected, text_light, text_dark, gradient_start_light, gradient_start_dark, gradient_end_light, gradient_end_dark, popup_light, popup_dark, activated_light, activated_dark, secondary_light, secondary_dark, secondary_activated_light, secondary_activated_dark) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) ON CONFLICT DO NOTHING`,
                            [
                                t.id,
                                t.selected,
                                t.text_light,
                                t.text_dark,
                                t.gradient_start_light,
                                t.gradient_start_dark,
                                t.gradient_end_light,
                                t.gradient_end_dark,
                                t.popup_light,
                                t.popup_dark,
                                t.activated_light,
                                t.activated_dark,
                                t.secondary_light,
                                t.secondary_dark,
                                t.secondary_activated_light,
                                t.secondary_activated_dark,
                            ]
                        );
                    }
                    log(`   ✅ Migrated ${themes.rows.length} themes`, 'green');
                }

                await dcPool.end();
            } else {
                log('   ⚠️  dc database not found, skipping', 'yellow');
            }
        } catch (err) {
            const error = err as { code?: string; message?: string };
            if (error.code === '3D000') {
                log('   ⚠️  dc database not found, skipping', 'yellow');
            } else {
                log(`   ⚠️  Error migrating dc: ${error.message || 'Unknown error'}`, 'yellow');
            }
        }
    }

    // Step 6: Migrate data from dc_sys
    log('\n📥 Step 6: Migrating data from dc_sys...', 'green');

    try {
        const dbCheck = await adminPool.query(`SELECT 1 FROM pg_database WHERE datname = 'dc_sys'`);

        if (dbCheck.rows.length > 0) {
            const dcSysPool = new Pool({
                ...baseConfig,
                database: 'dc_sys',
            });

            // Migrate logs
            try {
                const logs = await dcSysPool.query('SELECT * FROM logs');
                if (logs.rows.length > 0) {
                    for (const log of logs.rows) {
                        await shopPool.query(
                            `INSERT INTO dc_sys.logs (id, level, message, metadata, created_at) 
                             VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                            [log.id, log.level, log.message, log.metadata, log.created_at]
                        );
                    }
                    log(`   ✅ Migrated ${logs.rows.length} log entries`, 'green');
                }
            } catch {
                log('   ⚠️  logs table not found or empty', 'yellow');
            }

            // Migrate ota
            try {
                const ota = await dcSysPool.query('SELECT * FROM ota');
                if (ota.rows.length > 0) {
                    for (const o of ota.rows) {
                        await shopPool.query(
                            `INSERT INTO dc_sys.ota (id, version, url, changelog, created_at) 
                             VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                            [o.id, o.version, o.url, o.changelog, o.created_at]
                        );
                    }
                    log(`   ✅ Migrated ${ota.rows.length} OTA updates`, 'green');
                }
            } catch {
                log('   ⚠️  ota table not found or empty', 'yellow');
            }

            // Migrate web_token
            try {
                const tokens = await dcSysPool.query('SELECT * FROM web_token');
                if (tokens.rows.length > 0) {
                    for (const t of tokens.rows) {
                        await shopPool.query(
                            `INSERT INTO dc_sys.web_token (id, token, user_id, expires_at, created_at) 
                             VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                            [t.id, t.token, t.user_id, t.expires_at, t.created_at]
                        );
                    }
                    log(`   ✅ Migrated ${tokens.rows.length} web tokens`, 'green');
                }
            } catch {
                log('   ⚠️  web_token table not found or empty', 'yellow');
            }

            await dcSysPool.end();
        } else {
            log('   ⚠️  dc_sys database not found, skipping', 'yellow');
        }
    } catch (err) {
        const error = err as { code?: string; message?: string };
        if (error.code === '3D000') {
            log('   ⚠️  dc_sys database not found, skipping', 'yellow');
        } else {
            log(`   ⚠️  Error migrating dc_sys: ${error.message || 'Unknown error'}`, 'yellow');
        }
    }

    // Step 5: Set search path
    log('\n⚙️  Step 5: Setting default search path...', 'green');
    await shopPool.query(`ALTER DATABASE ${shopName} SET search_path TO dc_pos, dc, dc_sys, public`);
    log('   ✅ Search path configured', 'green');

    // Step 7: Verify
    log('\n✅ Step 7: Verifying migration...\n', 'green');
    const verification = await shopPool.query(`
        SELECT 'dc_pos Schema' as schema, '' as table_name, NULL::bigint as count
        UNION ALL
        SELECT '', 'users', COUNT(*) FROM dc_pos.users
        UNION ALL
        SELECT '', 'payment_methods', COUNT(*) FROM dc_pos.payment_methods
        UNION ALL
        SELECT '', 'facturation', COUNT(*) FROM dc_pos.facturation
        UNION ALL
        SELECT '', 'facturation_article', COUNT(*) FROM dc_pos.facturation_article
        UNION ALL
        SELECT '', 'parameters', COUNT(*) FROM dc_pos.parameters
        UNION ALL
        SELECT '', '', NULL
        UNION ALL
        SELECT 'dc Schema', '', NULL
        UNION ALL
        SELECT '', 'article', COUNT(*) FROM dc.article
        UNION ALL
        SELECT '', 'categorie', COUNT(*) FROM dc.categorie
        UNION ALL
        SELECT '', 'formule', COUNT(*) FROM dc.formule
        UNION ALL
        SELECT '', 'panier', COUNT(*) FROM dc.panier
        UNION ALL
        SELECT '', 'theme_admin', COUNT(*) FROM dc.theme_admin
        UNION ALL
        SELECT '', '', NULL
        UNION ALL
        SELECT 'dc_sys Schema', '', NULL
        UNION ALL
        SELECT '', 'logs', COUNT(*) FROM dc_sys.logs
        UNION ALL
        SELECT '', 'ota', COUNT(*) FROM dc_sys.ota
        UNION ALL
        SELECT '', 'web_token', COUNT(*) FROM dc_sys.web_token
    `);

    console.table(verification.rows);

    // Cleanup
    await shopPool.end();
    await adminPool.end();

    log('\n🎉 Migration complete!\n', 'green');
    log('Next steps:', 'yellow');
    log(`  1. Update your .env.local:`, 'yellow');
    log(`     NEXT_PUBLIC_SHOP_ID='${shopName}'`, 'yellow');
    log(`  2. Import Firestore data:`, 'yellow');
    log(`     bun run scripts/firestore-to-postgres.ts --file your-file.json\n`, 'yellow');
}

main().catch((err) => {
    log(`\n❌ Fatal error: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
});
