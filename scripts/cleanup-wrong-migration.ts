/**
 * Cleanup script to delete incorrectly created databases
 */

import 'dotenv/config';
import { Pool } from 'pg';

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
    log('\n🗑️  Cleanup Incorrectly Created Databases\n', 'yellow');

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

    // Connect to postgres system database
    const adminPool = new Pool({
        ...baseConfig,
        database: 'postgres',
    });

    const databasesToDelete = ['dc', 'dc_pos', 'dc_sys'];

    try {
        log('🔍 Checking which databases exist...', 'yellow');

        for (const dbName of databasesToDelete) {
            const checkResult = await adminPool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);

            if (checkResult.rows.length > 0) {
                log(`   Found: ${dbName}`, 'yellow');

                // Terminate connections to the database
                await adminPool.query(
                    `
                    SELECT pg_terminate_backend(pg_stat_activity.pid)
                    FROM pg_stat_activity
                    WHERE pg_stat_activity.datname = $1
                    AND pid <> pg_backend_pid()
                `,
                    [dbName]
                );

                // Drop the database
                await adminPool.query(`DROP DATABASE ${dbName}`);
                log(`   ✅ Deleted: ${dbName}`, 'green');
            } else {
                log(`   ⏭️  Not found: ${dbName}`, 'reset');
            }
        }

        log('\n✅ Cleanup complete!\n', 'green');
    } catch (error) {
        log(`\n❌ Error: ${error}\n`, 'red');
        throw error;
    } finally {
        await adminPool.end();
    }
}

main().catch(console.error);
