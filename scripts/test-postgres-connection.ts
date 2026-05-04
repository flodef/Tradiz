#!/usr/bin/env bun
/**
 * Test PostgreSQL connection
 *
 * This script verifies that your Neon PostgreSQL database is properly configured
 * and accessible.
 *
 * Usage: bun run scripts/test-postgres-connection.ts
 */

import { Client } from 'pg';

const requiredEnvVars = ['PG_HOST', 'PG_USER', 'PG_PASSWORD'];

console.log('🔍 Checking PostgreSQL configuration...\n');

// Check environment variables
let missingVars = false;
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing: ${envVar}`);
        missingVars = true;
    } else {
        const value = process.env[envVar];
        const display = envVar === 'PG_PASSWORD' ? '*'.repeat(Math.min(value.length, 20)) : value;
        console.log(`✅ ${envVar}: ${display}`);
    }
}

if (missingVars) {
    console.error('\n❌ Please configure all required environment variables in .env.local');
    process.exit(1);
}

console.log('\n🔌 Attempting to connect to PostgreSQL...\n');

const client = new Client({
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    database: 'postgres', // Connect to default postgres database
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false },
});

async function testConnection() {
    try {
        await client.connect();
        console.log('✅ Successfully connected to PostgreSQL!\n');

        // Test query
        const result = await client.query('SELECT version()');
        console.log('📊 Database info:');
        console.log(result.rows[0].version);
        console.log('');

        // Check for required databases
        const dbResult = await client.query(`
            SELECT datname FROM pg_database 
            WHERE datname IN ('dc', 'dc_pos', 'dc_sys')
            ORDER BY datname
        `);

        console.log('📊 Database status:');
        const existingDbs = dbResult.rows.map((row) => row.datname);

        if (existingDbs.includes('dc')) {
            console.log('   ✅ dc database exists');
        } else {
            console.log('   ⚠️  dc database not found (will be created during migration)');
        }

        if (existingDbs.includes('dc_pos')) {
            console.log('   ✅ dc_pos database exists');
        } else {
            console.log('   ⚠️  dc_pos database not found (will be created during migration)');
        }

        if (existingDbs.includes('dc_sys')) {
            console.log('   ✅ dc_sys database exists');
        } else {
            console.log('   ⚠️  dc_sys database not found (will be created during migration)');
        }

        if (existingDbs.length === 0) {
            console.log('\nℹ️  Run the migration script to create databases and tables.');
        }

        console.log('\n✨ Connection test completed successfully!');
    } catch (error) {
        console.error('\n❌ Connection failed:', error);
        console.error('\nTroubleshooting tips:');
        console.error('1. Verify your credentials at https://console.neon.tech');
        console.error('2. Check that your database is not paused (Neon auto-pauses inactive databases)');
        console.error('3. Ensure your IP is allowed (Neon allows all IPs by default)');
        process.exit(1);
    } finally {
        await client.end();
    }
}

testConnection();
