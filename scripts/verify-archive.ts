/**
 * Verify the HMAC-SHA256 signature of a fiscal archive JSON file.
 *
 * Usage:
 *   bun run scripts/verify-archive.ts <archive.json>
 *
 * Requires FISCAL_ARCHIVE_HMAC_KEY env var to be set (same key used by the
 * server when generating the archive).
 *
 * If the archive has no signature (null), the script reports that the archive
 * is unsigned and exits with code 2.
 */

import fs from 'fs';
import { createHmac } from 'crypto';

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', reset: '\x1b[0m' };

function log(msg: string, color: keyof typeof C = 'reset') {
    console.log(`${C[color]}${msg}${C.reset}`);
}

const filePath = process.argv[2];
if (!filePath) {
    log('Usage: bun run scripts/verify-archive.ts <archive.json>', 'red');
    process.exit(1);
}

const hmacKey = process.env.FISCAL_ARCHIVE_HMAC_KEY;
if (!hmacKey) {
    log('❌ FISCAL_ARCHIVE_HMAC_KEY env var is not set', 'red');
    log('   Set it to the same key used by the server when generating the archive.', 'yellow');
    process.exit(1);
}

try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const archive = JSON.parse(raw);

    if (!archive.signature) {
        log('⚠️  Archive is unsigned (signature is null).', 'yellow');
        log('   The archive was generated without FISCAL_ARCHIVE_HMAC_KEY set on the server.', 'yellow');
        log('   Cannot verify integrity.', 'yellow');
        process.exit(2);
    }

    const { signature: storedSignature, ...archiveWithoutSignature } = archive;
    const canonicalJson = JSON.stringify(archiveWithoutSignature);
    const computedSignature = createHmac('sha256', hmacKey).update(canonicalJson).digest('hex');

    if (storedSignature === computedSignature) {
        log('✅ Archive signature verified — HMAC-SHA256 matches.', 'green');
        log(`   Period: ${archive.period_start} to ${archive.period_end}`, 'reset');
        log(`   Transactions: ${archive.transactions?.length ?? 0}`, 'reset');
        log(`   Daily closures: ${archive.daily_closures?.length ?? 0}`, 'reset');
        log(`   Audit events: ${archive.audit_events?.length ?? 0}`, 'reset');
        process.exit(0);
    } else {
        log('❌ Archive signature MISMATCH — the archive has been tampered with.', 'red');
        log(`   Stored:   ${storedSignature}`, 'red');
        log(`   Computed: ${computedSignature}`, 'red');
        process.exit(1);
    }
} catch (error) {
    log('❌ Error verifying archive:', 'red');
    console.error(error);
    process.exit(1);
}
