/**
 * Validate Transactions and Extract Errors
 *
 * This script performs a dry-run validation of all transactions to identify
 * which ones would fail due to data type issues (like decimal quantities).
 * It creates a retry file with only the problematic transactions.
 *
 * Usage:
 *   bun run scripts/validate-and-extract-errors.ts --file <export.json>
 *
 * The script will:
 * 1. Load all transactions from the JSON file
 * 2. Validate each transaction for common issues:
 *    - Decimal quantities (0.5, 1.5, etc.)
 *    - Invalid data types
 *    - Missing required fields
 * 3. Create a retry file with only problematic transactions
 * 4. Show summary of issues found
 */

import 'dotenv/config';
import { loadFromFile } from './import/firestore';
import type { TransactionSet } from './import/types';
import * as fs from 'fs';

// Parse command line arguments
const args = process.argv.slice(2);
const fileIdx = args.indexOf('--file');

if (fileIdx === -1 || !args[fileIdx + 1]) {
    console.error('❌ Usage: bun run scripts/validate-and-extract-errors.ts --file <path.json>');
    process.exit(1);
}

const filePath = args[fileIdx + 1];

if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
}

console.log(`\n🔍 Transaction Validator\n`);
console.log(`📁 File: ${filePath}\n`);

interface ValidationIssue {
    type: 'decimal_quantity' | 'invalid_type' | 'missing_field' | 'other';
    message: string;
    panierId: string;
    txIndex: number;
    productIndex?: number;
    value?: unknown;
}

function validateTransaction(entry: TransactionSet, txIndex: number): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const tx = entry.transactions[txIndex];

    // Check each product in the transaction
    tx.products.forEach((product, productIndex) => {
        // Check for decimal quantities
        if (product.quantity !== undefined && product.quantity !== null) {
            const qty = Number(product.quantity);
            if (!Number.isNaN(qty) && !Number.isInteger(qty)) {
                issues.push({
                    type: 'decimal_quantity',
                    message: `Product "${product.label}" has decimal quantity: ${qty}`,
                    panierId: entry.id,
                    txIndex,
                    productIndex,
                    value: qty,
                });
            }
        }

        // Check for other potential type issues
        if (product.amount !== undefined && typeof product.amount !== 'number') {
            const parsed = parseFloat(String(product.amount));
            if (Number.isNaN(parsed)) {
                issues.push({
                    type: 'invalid_type',
                    message: `Product "${product.label}" has invalid amount: ${product.amount}`,
                    panierId: entry.id,
                    txIndex,
                    productIndex,
                    value: product.amount,
                });
            }
        }

        // Check for missing required fields
        if (!product.label) {
            issues.push({
                type: 'missing_field',
                message: `Product at index ${productIndex} is missing label`,
                panierId: entry.id,
                txIndex,
                productIndex,
            });
        }
    });

    return issues;
}

async function main() {
    console.log('📖 Loading export file...\n');
    const allEntries: TransactionSet[] = loadFromFile(filePath);

    let totalTransactions = 0;
    let totalProducts = 0;

    for (const entry of allEntries) {
        totalTransactions += entry.transactions.length;
        for (const tx of entry.transactions) {
            totalProducts += tx.products.length;
        }
    }

    console.log(`✅ Loaded ${allEntries.length} days`);
    console.log(`   ${totalTransactions} transactions`);
    console.log(`   ${totalProducts} products\n`);

    console.log('🔍 Validating transactions...\n');

    const allIssues: ValidationIssue[] = [];
    const problematicEntries: TransactionSet[] = [];
    const issuesByType = new Map<string, number>();

    let processedTx = 0;

    for (const entry of allEntries) {
        const entryIssues: ValidationIssue[] = [];

        entry.transactions.forEach((tx, txIndex) => {
            const issues = validateTransaction(entry, txIndex);
            if (issues.length > 0) {
                entryIssues.push(...issues);
                allIssues.push(...issues);

                // Count issues by type
                issues.forEach((issue) => {
                    const count = issuesByType.get(issue.type) || 0;
                    issuesByType.set(issue.type, count + 1);
                });
            }

            processedTx++;
            if (processedTx % 1000 === 0) {
                process.stdout.write(`\r   Processed: ${processedTx}/${totalTransactions}`);
            }
        });

        // If this entry has issues, add it to problematic entries
        if (entryIssues.length > 0) {
            // Only include transactions that have issues
            const problematicTransactions = entry.transactions.filter((tx, txIndex) => {
                return entryIssues.some((issue) => issue.txIndex === txIndex);
            });

            if (problematicTransactions.length > 0) {
                problematicEntries.push({
                    id: entry.id,
                    transactions: problematicTransactions,
                });
            }
        }
    }

    process.stdout.write(`\r   Processed: ${totalTransactions}/${totalTransactions}\n\n`);

    // Display summary
    console.log('📊 Validation Summary:\n');

    if (allIssues.length === 0) {
        console.log('✅ No issues found! All transactions are valid.\n');
        return;
    }

    console.log(
        `❌ Found ${allIssues.length} issues in ${problematicEntries.reduce((sum, e) => sum + e.transactions.length, 0)} transactions:\n`
    );

    // Show breakdown by issue type
    issuesByType.forEach((count, type) => {
        const emoji = type === 'decimal_quantity' ? '🔢' : type === 'invalid_type' ? '⚠️' : '❓';
        const label = type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        console.log(`   ${emoji} ${label}: ${count}`);
    });

    console.log('');

    // Show first 10 examples
    console.log('📝 First 10 examples:\n');
    allIssues.slice(0, 10).forEach((issue, idx) => {
        console.log(`   ${idx + 1}. [${issue.panierId}] ${issue.message}`);
    });

    if (allIssues.length > 10) {
        console.log(`   ... and ${allIssues.length - 10} more\n`);
    } else {
        console.log('');
    }

    // Save problematic transactions to retry file
    const retryFilePath = filePath.replace('.json', '-retry.json');
    fs.writeFileSync(retryFilePath, JSON.stringify(problematicEntries, null, 2), 'utf-8');

    const retryTxCount = problematicEntries.reduce((sum, e) => sum + e.transactions.length, 0);

    console.log(`💾 Saved ${retryTxCount} problematic transactions to:\n   ${retryFilePath}\n`);

    // Save detailed issue report
    const reportPath = filePath.replace('.json', '-validation-report.txt');
    const reportLines = [
        '='.repeat(80),
        'TRANSACTION VALIDATION REPORT',
        '='.repeat(80),
        '',
        `File: ${filePath}`,
        `Generated: ${new Date().toISOString()}`,
        '',
        'SUMMARY',
        '-'.repeat(80),
        `Total Transactions: ${totalTransactions}`,
        `Total Products: ${totalProducts}`,
        `Issues Found: ${allIssues.length}`,
        `Problematic Transactions: ${retryTxCount}`,
        '',
        'ISSUES BY TYPE',
        '-'.repeat(80),
    ];

    issuesByType.forEach((count, type) => {
        const label = type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        reportLines.push(`${label}: ${count}`);
    });

    reportLines.push('', 'DETAILED ISSUES', '-'.repeat(80));

    allIssues.forEach((issue, idx) => {
        reportLines.push(`${idx + 1}. [${issue.type}] ${issue.panierId} - ${issue.message}`);
        if (issue.value !== undefined) {
            reportLines.push(`   Value: ${issue.value}`);
        }
    });

    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf-8');

    console.log(`📄 Detailed report saved to:\n   ${reportPath}\n`);

    console.log('🚀 Next steps:\n');
    console.log('   1. Update your database schema to support decimal quantities:');
    console.log('      bun run scripts/alter-quantity-decimal-postgres.sql (for PostgreSQL)');
    console.log('      or');
    console.log('      bun run scripts/alter-quantity-decimal.sql (for MariaDB)\n');
    console.log('   2. Retry the problematic transactions:');
    console.log(`      bun run scripts/firestore-to-postgres.ts --file ${retryFilePath} --overwrite`);
    console.log('      or');
    console.log(`      bun run scripts/firestore-to-mariadb.ts --file ${retryFilePath} --overwrite\n`);

    console.log('✨ Done!');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
