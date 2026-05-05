/**
 * Retry Failed Transactions Tool
 *
 * This script reads the error log from a previous import and retries only the failed transactions.
 * It extracts transaction identifiers from error messages and re-imports them.
 *
 * Usage:
 *   bun run scripts/retry-failed-transactions.ts --file <original-export.json> --database postgres|mariadb
 *
 * The script will:
 * 1. Parse error messages from the last import
 * 2. Extract failed transaction identifiers (panier_id + timestamp)
 * 3. Load only those transactions from the JSON file
 * 4. Retry importing them with the same retry logic
 */

import 'dotenv/config';
import { loadFromFile } from './import/firestore';
import { msToDatetime } from './import/types';
import type { TransactionSet } from './import/types';
import * as fs from 'fs';
import * as readline from 'readline';

// Parse command line arguments
const args = process.argv.slice(2);
const fileIdx = args.indexOf('--file');
const dbIdx = args.indexOf('--database');

if (fileIdx === -1 || !args[fileIdx + 1]) {
    console.error(
        '❌ Usage: bun run scripts/retry-failed-transactions.ts --file <path.json> --database postgres|mariadb'
    );
    process.exit(1);
}

const filePath = args[fileIdx + 1];
const database = dbIdx !== -1 && args[dbIdx + 1] ? args[dbIdx + 1] : 'postgres';

if (!['postgres', 'mariadb'].includes(database)) {
    console.error('❌ Database must be either "postgres" or "mariadb"');
    process.exit(1);
}

console.log(`\n🔄 Retry Failed Transactions Tool\n`);
console.log(`📁 File: ${filePath}`);
console.log(`🗄️  Database: ${database}\n`);

// Prompt for error log
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
    // Ask user to paste error messages or provide error log file
    console.log('Please provide the error messages from your previous import.');
    console.log('You can either:');
    console.log('  1. Paste the error lines here (press Ctrl+D when done)');
    console.log('  2. Provide a path to an error log file\n');

    const choice = await prompt('Enter "1" to paste errors or "2" to provide file path: ');

    let errorText: string;

    if (choice === '2') {
        const errorLogPath = await prompt('Error log file path: ');
        if (!fs.existsSync(errorLogPath)) {
            console.error(`❌ File not found: ${errorLogPath}`);
            process.exit(1);
        }
        errorText = fs.readFileSync(errorLogPath, 'utf-8');
    } else {
        console.log('\nPaste error messages (press Ctrl+D when done):\n');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const lines: string[] = [];
        for await (const line of rl) {
            lines.push(line);
        }
        errorText = lines.join('\n');
        rl.close();
    }

    // Parse error messages to extract failed transaction identifiers
    // Format: "Error importing transaction from {panier_id} at {timestamp}"
    const errorPattern = /Error importing transaction from (\S+) at ([\d-]+ [\d:]+)/g;
    const failedTransactions: Array<{ panierId: string; timestamp: string }> = [];

    let match;
    while ((match = errorPattern.exec(errorText)) !== null) {
        failedTransactions.push({
            panierId: match[1],
            timestamp: match[2],
        });
    }

    if (failedTransactions.length === 0) {
        console.log('\n⚠️  No failed transactions found in error messages.');
        console.log('Make sure the error messages contain lines like:');
        console.log('  "✗ Error importing transaction from shop_2025-03-30 at 2025-03-30 11:27:38"');
        process.exit(0);
    }

    console.log(`\n✅ Found ${failedTransactions.length} failed transactions to retry\n`);

    // Load the full export file
    console.log('📖 Loading export file...');
    const allEntries: TransactionSet[] = loadFromFile(filePath);

    // Filter to only failed transactions
    const retryEntries: TransactionSet[] = [];

    for (const entry of allEntries) {
        const matchingTransactions = entry.transactions.filter((tx) => {
            const txTimestamp = msToDatetime(tx.createdDate);
            return failedTransactions.some(
                (failed) => failed.panierId === entry.id && failed.timestamp === txTimestamp
            );
        });

        if (matchingTransactions.length > 0) {
            retryEntries.push({
                id: entry.id,
                transactions: matchingTransactions,
            });
        }
    }

    console.log(
        `✅ Extracted ${retryEntries.reduce((sum, e) => sum + e.transactions.length, 0)} transactions to retry\n`
    );

    // Save filtered transactions to a new file
    const retryFilePath = filePath.replace('.json', '-retry.json');
    fs.writeFileSync(retryFilePath, JSON.stringify(retryEntries, null, 2), 'utf-8');

    console.log(`💾 Saved retry transactions to: ${retryFilePath}\n`);
    console.log('🚀 Now run the import script with this file:\n');

    if (database === 'postgres') {
        console.log(`   bun run scripts/firestore-to-postgres.ts --file ${retryFilePath} --overwrite`);
    } else {
        console.log(`   bun run scripts/firestore-to-mariadb.ts --file ${retryFilePath} --overwrite`);
    }

    console.log('\n✨ Done!');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
