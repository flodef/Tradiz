import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { getSoftwareVersion, getSoftwareName } from '@/app/utils/version';
import { NF525_CERTIFICATE_NUMBER } from '@/app/utils/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);
        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';

        // Fetch shop parameters for company info
        const [paramRows] = await connection.execute(
            `SELECT param_key, param_value FROM ${prefix}parameters WHERE param_key IN ('name', 'serial', 'vatNumber', 'address', 'zipCode', 'city')`
        );
        const params = new Map<string, string>();
        for (const row of paramRows as { param_key: string; param_value: string }[]) {
            params.set(row.param_key, row.param_value);
        }

        // Count transactions, closures, audit events
        const countQuery = (table: string) =>
            isPg ? `SELECT COUNT(*)::int AS c FROM ${prefix}${table}` : `SELECT COUNT(*) AS c FROM ${prefix}${table}`;
        const [txCount] = await connection.execute(countQuery('transactions'));
        const [dailyCount] = await connection.execute(countQuery('daily_closures'));
        const [monthlyCount] = await connection.execute(countQuery('monthly_closures'));
        const [annualCount] = await connection.execute(countQuery('annual_closures'));
        const [auditCount] = await connection.execute(countQuery('audit_events'));

        // Get first and last transaction dates
        const [dateRange] = await connection.execute(
            isPg
                ? `SELECT MIN(created_at)::text AS first_date, MAX(created_at)::text AS last_date FROM ${prefix}transactions`
                : `SELECT MIN(created_at) AS first_date, MAX(created_at) AS last_date FROM ${prefix}transactions`
        );
        const dates = (dateRange as { first_date: string | null; last_date: string | null }[])[0];

        // Get perpetual totals
        const [perpRows] = await connection.execute(`SELECT * FROM ${prefix}perpetual_totals WHERE id = 1`);
        const perpetual = (perpRows as unknown[])[0] ?? null;

        const certificate = {
            type_certificat: 'Auto-certification NF525',
            numero_certificat: NF525_CERTIFICATE_NUMBER,
            date_generation: new Date().toISOString(),
            logiciel: {
                nom: getSoftwareName(),
                version: getSoftwareVersion(),
            },
            entreprise: {
                nom: params.get('name') || '',
                siret: params.get('serial') || '',
                numero_tva: params.get('vatNumber') || '',
                adresse: params.get('address') || '',
                code_postal: params.get('zipCode') || '',
                ville: params.get('city') || '',
            },
            resume_donnees: {
                nombre_transactions: (txCount as { c: number }[])[0]?.c ?? 0,
                nombre_clotures_journalieres: (dailyCount as { c: number }[])[0]?.c ?? 0,
                nombre_clotures_mensuelles: (monthlyCount as { c: number }[])[0]?.c ?? 0,
                nombre_clotures_annuelles: (annualCount as { c: number }[])[0]?.c ?? 0,
                nombre_evenements_audit: (auditCount as { c: number }[])[0]?.c ?? 0,
                premiere_transaction: dates?.first_date ?? null,
                derniere_transaction: dates?.last_date ?? null,
            },
            totaux_perpetuels: perpetual,
            fonctionnalites_conformite: {
                inalterabilite: 'Hachage chaîné SHA-256 sur toutes les transactions',
                integrite: 'Clôtures journalières/mensuelles/annuelles avec hachage chaîné',
                traceabilite: 'Toutes les opérations sensibles sont journalisées avec hachage chaîné dans audit_events',
                export_donnees: "Export d'archive fiscale disponible via /api/sql/fiscalArchive",
                totaux_perpetuels: 'Accumulateur permanent avec ancrage sur le dernier hash de clôture',
            },
            note: 'Ce certificat est généré automatiquement par le logiciel. La certification NF525 officielle doit être délivrée par un organisme accrédité (ex. LNE).',
        };

        const filename = `certificat_nf525_${new Date().toISOString().substring(0, 10)}.json`;
        return new NextResponse(JSON.stringify(certificate, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error('Error generating certificate:', error);
        return NextResponse.json({ error: 'Failed to generate certificate' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
