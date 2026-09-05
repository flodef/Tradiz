import { NextResponse } from 'next/server';
import { getSoftwareVersion, getSoftwareName } from '@/app/utils/version';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        software: {
            name: getSoftwareName(),
            version: getSoftwareVersion(),
        },
        security_measures: [
            {
                category: 'Inalterability',
                measure: 'SHA-256 chained hashing on all transactions',
                description: 'Each transaction stores a hash computed from its data and the previous transaction\'s hash, forming a tamper-evident chain.',
                nf525_requirement: 'Article 1 - Conservation de l\'inalterabilité des données',
            },
            {
                category: 'Integrity',
                measure: 'Daily, monthly, and annual closures with chained hashes',
                description: 'Periodic closures aggregate transaction totals and chain hashes, providing hierarchical integrity verification.',
                nf525_requirement: 'Article 2 - Conservation de l\'intégrité des données',
            },
            {
                category: 'Audit Trail',
                measure: 'Chained audit events for all sensitive operations',
                description: 'All transaction CRUD, closures, parameter changes, software updates, and data exports are logged in audit_events with chained hashes.',
                nf525_requirement: 'Article 3 - Traçabilité des modifications',
            },
            {
                category: 'Perpetual Totals',
                measure: 'Running accumulator with last closure hash anchor',
                description: 'A single-row perpetual_totals table maintains grand totals and anchors to the last daily closure hash.',
                nf525_requirement: 'Article 2 - Totaux perpétuels',
            },
            {
                category: 'Integrity Verification',
                measure: 'On-demand integrity check endpoint',
                description: 'The /api/sql/verifyIntegrity endpoint recomputes all transaction hashes and verifies the chain, detecting any tampering.',
                nf525_requirement: 'Article 2 - Vérification de l\'intégrité',
            },
            {
                category: 'Data Export',
                measure: 'Fiscal archive export with audit trail logging',
                description: 'The /api/sql/fiscalArchive endpoint exports all fiscal data (transactions, closures, audit events) as JSON, and logs the export itself as an audit event.',
                nf525_requirement: 'Article 4 - Archivage et export des données',
            },
            {
                category: 'Transaction Immutability',
                measure: 'Soft-delete and hard-delete tracked with audit events',
                description: 'Deleted transactions are marked with payment_method (EFFACÉE/SUPPRIMÉE) rather than being removed, preserving the hash chain. Hard deletes are logged with audit events.',
                nf525_requirement: 'Article 1 - Conservation des données',
            },
            {
                category: 'Database Security',
                measure: 'SSL connections to PostgreSQL (Neon)',
                description: 'Database connections use SSL with rejectUnauthorized:false for Neon serverless PostgreSQL, ensuring encrypted data transit.',
                nf525_requirement: 'General security - encrypted connections',
            },
        ],
        audit_event_types: [
            'transaction_add',
            'transaction_update',
            'transaction_delete',
            'transaction_hard_delete',
            'transaction_sync',
            'daily_closure',
            'monthly_closure',
            'annual_closure',
            'parameter_change',
            'software_update',
            'archive_export',
        ],
    });
}
