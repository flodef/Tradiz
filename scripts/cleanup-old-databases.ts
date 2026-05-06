/**
 * Cleanup Old Databases
 *
 * This script safely removes the old separate databases (dc, dc_pos, dc_sys)
 * after you've migrated to the new shop-based structure.
 *
 * ⚠️  WARNING: This will permanently delete data!
 * Only run this AFTER you've verified the migration was successful.
 *
 * Usage:
 *   bun run scripts/cleanup-old-databases.ts
 */

import 'dotenv/config';
import { Pool } from 'pg';
import * as readline from 'readline';

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
            resolve(answer.trim().toLowerCase());
        });
    });
}

async function main() {
    log('\n🗑️  Cleanup Old Databases\n', 'yellow');
    log('This script can delete:', 'yellow');
    log('   - dc, dc_pos, dc_sys (old structure)', 'yellow');
    log('   - neondb (Neon default database - usually empty)\n', 'yellow');

    const includeNeonDb = await prompt('Also delete "neondb" database? (yes/no): ');

    log('\n⚠️  WARNING: This will permanently delete data!', 'red');
    log('\nMake sure you have:', 'yellow');
    log('   ✅ Successfully migrated to the new shop structure', 'yellow');
    log('   ✅ Verified all data is present in the new database', 'yellow');
    log('   ✅ Backed up your data (if needed)\n', 'yellow');

    // Check DATABASE connection parameters
    if (!process.env.PG_HOST || !process.env.PG_PORT || !process.env.PG_USER || !process.env.PG_PASSWORD) {
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

    // Connect to postgres database (system database) to avoid being connected to a database we want to delete
    const adminPool = new Pool({
        ...baseConfig,
        database: 'postgres', // Always use postgres system database for admin operations
    });

    log(`\n📡 Connected to system database for admin operations`, 'green');

    try {
        // Build list of databases to check
        const databasesToDelete = ['dc', 'dc_pos', 'dc_sys'];
        if (includeNeonDb === 'yes') {
            databasesToDelete.push('neondb');
        }

        // Check which databases exist
        const { rows } = await adminPool.query(
            `
            SELECT datname FROM pg_database 
            WHERE datname = ANY($1::text[])
            ORDER BY datname
        `,
            [databasesToDelete]
        );

        if (rows.length === 0) {
            log('✅ No old databases found. Nothing to clean up!', 'green');
            await adminPool.end();
            return;
        }

        log(`\nFound ${rows.length} database(s) to delete:`, 'yellow');
        rows.forEach((row) => {
            log(`   - ${row.datname}`, 'yellow');
        });

        // First confirmation
        const confirm1 = await prompt('\nAre you ABSOLUTELY SURE you want to delete these? (yes/no): ');
        if (confirm1 !== 'yes') {
            log('\n❌ Cleanup cancelled.', 'green');
            await adminPool.end();
            return;
        }

        // Second confirmation
        const confirm2 = await prompt('Type "DELETE" in capital letters to confirm: ');
        if (confirm2 !== 'delete') {
            log('\n❌ Cleanup cancelled.', 'green');
            await adminPool.end();
            return;
        }

        log('\n🗑️  Deleting databases...\n', 'red');

        // Terminate all connections to these databases first
        for (const row of rows) {
            const dbName = row.datname;

            try {
                // Terminate connections
                await adminPool.query(
                    `
                    SELECT pg_terminate_backend(pg_stat_activity.pid)
                    FROM pg_stat_activity
                    WHERE pg_stat_activity.datname = $1
                    AND pid <> pg_backend_pid()
                `,
                    [dbName]
                );

                // Drop database
                await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
                log(`   ✅ Deleted: ${dbName}`, 'green');
            } catch (err) {
                const error = err as { message?: string };
                log(`   ❌ Error deleting ${dbName}: ${error.message || 'Unknown error'}`, 'red');
            }
        }

        log('\n🎉 Cleanup complete!\n', 'green');
        log('Your data is now only in the new shop-based structure.', 'green');
        log('Old databases have been removed.\n', 'green');
    } catch (err) {
        const error = err as { message?: string };
        log(`\n❌ Fatal error: ${error.message || 'Unknown error'}`, 'red');
        console.error(err);
        process.exit(1);
    } finally {
        await adminPool.end();
    }
}

main().catch((err) => {
    log(`\n❌ Fatal error: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
});
