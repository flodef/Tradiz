/**
 * Verify that the actual database schema matches the expected schema.
 *
 * Parses `scripts/create-postgres-database.sql` and all `scripts/migrate-*.sql`
 * files to extract the expected tables and columns, then compares against
 * the actual database schema.
 *
 * Usage:
 *   bun run scripts/verify-schema.ts
 *
 * Exit codes:
 *   0 = schema is up to date
 *   1 = schema has differences (migration needed)
 *   2 = connection error
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Load .env.local if .env doesn't have DATABASE_URL (Next.js uses .env.local)
import { config } from 'dotenv';
config({ path: '.env.local' });

// ── Types ────────────────────────────────────────────────────────────────────

interface ExpectedColumn {
    name: string;
    type: string;
}

interface ExpectedTable {
    schema: string;
    name: string;
    columns: Map<string, ExpectedColumn>;
}

// ── SQL parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a CREATE TABLE statement and extract table name, schema, and columns.
 * Handles multi-line statements with columns separated by commas.
 */
function parseCreateTable(sql: string): ExpectedTable | null {
    // Match: CREATE TABLE IF NOT EXISTS schema.name ( ... )
    // or: CREATE TABLE IF NOT EXISTS name ( ... )
    const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+(?:\.\w+)?)\s*\(([\s\S]*?)\)\s*(?:;|$)/i);
    if (!match) return null;

    const fullName = match[1];
    const body = match[2];

    let schema = 'public';
    let name = fullName;
    if (fullName.includes('.')) {
        const parts = fullName.split('.');
        schema = parts[0];
        name = parts[1];
    }

    const columns = new Map<string, ExpectedColumn>();

    // Split by commas, but respect parentheses (for FK references)
    const lines: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of body) {
        if (char === '(') depth++;
        else if (char === ')') depth--;
        if (char === ',' && depth === 0) {
            lines.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) lines.push(current.trim());

    for (const line of lines) {
        if (!line) continue;
        // Skip constraint lines: FOREIGN KEY, PRIMARY KEY, CONSTRAINT, UNIQUE, CHECK
        if (/^(FOREIGN\s+KEY|PRIMARY\s+KEY|CONSTRAINT|UNIQUE|CHECK)\b/i.test(line)) continue;

        // Extract column name (first word) and type (rest until DEFAULT or comma or end)
        const colMatch = line.match(/^(\w+)\s+(.+?)(?:\s+DEFAULT\s+|\s*$)/i);
        if (colMatch) {
            const colName = colMatch[1].toLowerCase();
            // Don't lowercase the type — keep it for reference
            const colType = colMatch[2].trim().replace(/\s+/g, ' ');
            columns.set(colName, { name: colName, type: colType });
        }
    }

    return { schema, name, columns };
}

/**
 * Parse an ALTER TABLE ... ADD COLUMN statement.
 * Returns the table name, column name, and type.
 * Only parses PostgreSQL statements (must have a schema prefix like dc_pos.).
 */
function parseAddColumn(sql: string): { schema: string; name: string; column: ExpectedColumn } | null {
    // Match: ALTER TABLE schema.name ADD COLUMN IF NOT EXISTS col_name TYPE ...
    // Only match statements with a schema prefix (dc_pos., dc., etc.) to skip
    // MariaDB statements that use bare table names (e.g., ALTER TABLE transactions).
    const match = sql.match(
        /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+\.\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+(.+?)(?:\s+DEFAULT\s+|\s*;|\s*$)/i
    );
    if (!match) return null;

    const fullName = match[1];
    const colName = match[2].toLowerCase();
    const colType = match[3].trim().replace(/\s+/g, ' ');

    const parts = fullName.split('.');
    const schema = parts[0];
    const name = parts[1];

    return { schema, name, column: { name: colName, type: colType } };
}

/**
 * Parse all SQL files and build the expected schema.
 * Reads create-postgres-database.sql first, then all migrate-*.sql files.
 */
function parseExpectedSchema(): Map<string, ExpectedTable> {
    const tables = new Map<string, ExpectedTable>();
    const scriptsDir = join(process.cwd(), 'scripts');

    // 1. Parse create-postgres-database.sql
    const createSql = readFileSync(join(scriptsDir, 'create-postgres-database.sql'), 'utf-8');
    // Split by semicolons, but be careful with strings and functions
    const statements = splitSqlStatements(createSql);
    for (const stmt of statements) {
        if (/CREATE\s+TABLE/i.test(stmt)) {
            const table = parseCreateTable(stmt);
            if (table) {
                const key = `${table.schema}.${table.name}`;
                tables.set(key, table);
            }
        }
    }

    // 2. Parse all migrate-*.sql files (apply ALTER TABLE ADD COLUMN on top)
    const migrateFiles = readdirSync(scriptsDir)
        .filter((f) => f.startsWith('migrate-') && f.endsWith('.sql'))
        .sort();
    for (const file of migrateFiles) {
        const sql = readFileSync(join(scriptsDir, file), 'utf-8');
        const stmts = splitSqlStatements(sql);
        for (const stmt of stmts) {
            if (/ALTER\s+TABLE.*ADD\s+COLUMN/i.test(stmt)) {
                const col = parseAddColumn(stmt);
                if (col) {
                    const key = `${col.schema}.${col.name}`;
                    const table = tables.get(key);
                    if (table) {
                        // Add or update the column
                        table.columns.set(col.column.name, col.column);
                    } else {
                        // Table not in CREATE TABLE — create a stub
                        const newTable: ExpectedTable = {
                            schema: col.schema,
                            name: col.name,
                            columns: new Map([[col.column.name, col.column]]),
                        };
                        tables.set(key, newTable);
                    }
                }
            }
        }
    }

    return tables;
}

/**
 * Split SQL into statements by semicolons, respecting string literals
 * and dollar-quoted strings (PostgreSQL).
 */
function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inDollarQuote = false;
    let dollarTag = '';

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const next = sql[i + 1];

        if (char === "'" && !inDoubleQuote && !inDollarQuote) {
            inSingleQuote = !inSingleQuote;
        } else if (char === '"' && !inSingleQuote && !inDollarQuote) {
            inDoubleQuote = !inDoubleQuote;
        } else if (char === '$' && !inSingleQuote && !inDoubleQuote) {
            // Check for dollar quote tag: $tag$
            const tagMatch = sql.slice(i).match(/^\$(\w*)\$/);
            if (tagMatch) {
                const tag = tagMatch[1];
                if (inDollarQuote && dollarTag === tag) {
                    inDollarQuote = false;
                    dollarTag = '';
                } else if (!inDollarQuote) {
                    inDollarQuote = true;
                    dollarTag = tag;
                }
            }
        }

        if (char === ';' && !inSingleQuote && !inDoubleQuote && !inDollarQuote) {
            if (current.trim()) statements.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) statements.push(current.trim());

    return statements;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    reset: '\x1b[0m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
    // Build connection string from PG_* env vars (same as the app does in pg-db.ts)
    const host = process.env.PG_HOST;
    const user = process.env.PG_USER;
    const password = process.env.PG_PASSWORD;
    const shopId = process.env.NEXT_PUBLIC_SHOP_ID || process.env.PG_DATABASE;
    const database = shopId || '';

    if (!host || !user || !password || !database) {
        log('ERROR: Missing PG_HOST, PG_USER, PG_PASSWORD, or NEXT_PUBLIC_SHOP_ID in .env.local', 'red');
        process.exit(2);
    }

    const connectionString = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${encodeURIComponent(database)}?sslmode=verify-full`;

    // Parse expected schema from SQL files
    let expectedTables: Map<string, ExpectedTable>;
    try {
        expectedTables = parseExpectedSchema();
        log(`\n📋 Parsed ${expectedTables.size} expected tables from SQL files`, 'blue');
    } catch (error) {
        log(`ERROR: Failed to parse SQL files: ${error}`, 'red');
        process.exit(2);
    }

    let pool: Pool | undefined;
    try {
        pool = new Pool({ connectionString, connectionTimeoutMillis: 10000 });
        const client = await pool.connect();

        log('\n🔍 Checking database schema...\n', 'blue');

        let hasDifferences = false;
        const migrationsNeeded: string[] = [];

        for (const key of Array.from(expectedTables.keys())) {
            const expectedTable = expectedTables.get(key)!;
            // Check if table exists
            const tableExists = await client.query(
                `SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = $1 AND table_name = $2
                 ) as exists`,
                [expectedTable.schema, expectedTable.name]
            );
            const exists = tableExists.rows[0]?.exists === true || false;

            if (!exists) {
                log(`❌ Table ${key} is MISSING`, 'red');
                hasDifferences = true;
                migrationsNeeded.push(`-- CREATE TABLE ${key} (...)`);
                continue;
            }

            // Get actual columns
            const colResult = await client.query(
                `SELECT column_name
                 FROM information_schema.columns
                 WHERE table_schema = $1 AND table_name = $2
                 ORDER BY ordinal_position`,
                [expectedTable.schema, expectedTable.name]
            );
            const actualCols = new Set(colResult.rows.map((r: { column_name: string }) => r.column_name.toLowerCase()));

            // Check each expected column
            const missingCols: string[] = [];
            for (const colName of Array.from(expectedTable.columns.keys())) {
                const colDef = expectedTable.columns.get(colName)!;
                if (!actualCols.has(colName)) {
                    log(`❌ ${key}.${colName} is MISSING`, 'red');
                    missingCols.push(`${colName} ${colDef.type}`);
                    hasDifferences = true;
                }
            }

            if (missingCols.length === 0) {
                log(`✅ ${key}`, 'green');
            } else {
                const colDefs = missingCols.map((c) => `ALTER TABLE ${key} ADD COLUMN IF NOT EXISTS ${c};`).join('\n');
                migrationsNeeded.push(`-- Missing columns in ${key}\n${colDefs}`);
            }
        }

        client.release();

        if (hasDifferences) {
            log('\n⚠️  Schema differences detected! Migration needed.\n', 'yellow');
            log('Suggested migration script:', 'yellow');
            log('----------------------------------------', 'dim');
            for (const m of migrationsNeeded) {
                log(m, 'yellow');
            }
            log('----------------------------------------', 'dim');
            log('\nRun the migration in your database before releasing.', 'yellow');
            process.exit(1);
        } else {
            log('\n✅ Database schema is up to date.\n', 'green');
            process.exit(0);
        }
    } catch (error) {
        log(`\n❌ Connection error: ${error}\n`, 'red');
        process.exit(2);
    } finally {
        await pool?.end();
    }
}

main();
