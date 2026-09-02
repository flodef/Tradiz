import { getShopIdFromRequest } from '@/app/constants/shop';
import { toSQLDateTime } from '@/app/utils/date';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';
import { aggregateMealsByCustomer } from '../billingHelpers';
import { getCompanyTransactionStats } from '../billingStats';

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get('companyName');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!companyName || !startDate || !endDate) {
        return NextResponse.json({ error: 'Missing or invalid companyName, startDate or endDate' }, { status: 400 });
    }

    let connection: DbConnection | undefined;
    try {
        connection = await getPosDb(shopId);

        const companyQuery = connection.isPostgreSQL
            ? 'SELECT id, employer_share, siret, vat_number, address, zip_code, city FROM dc_pos.companies WHERE name = $1'
            : 'SELECT id, employer_share, siret, vat_number, address, zip_code, city FROM companies WHERE name = ?';
        const [companyRows] = await connection.execute(companyQuery, [companyName]);
        const company = (
            companyRows as {
                id: number;
                employer_share: number;
                siret: string | null;
                vat_number: string | null;
                address: string | null;
                zip_code: string | null;
                city: string | null;
            }[]
        )[0];

        if (!company) {
            return NextResponse.json({ error: 'Company not found' }, { status: 404 });
        }

        const employerShare = Number(company.employer_share ?? 0);
        if (employerShare <= 0) {
            return NextResponse.json({ error: 'Company meal price is not set' }, { status: 400 });
        }

        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');
        const startAt = toSQLDateTime(start);
        const endAt = toSQLDateTime(end);

        const aggregation = await aggregateMealsByCustomer(connection, companyName, startAt, endAt);
        const stats = await getCompanyTransactionStats(connection, companyName, startAt, endAt);

        // Determine the dominant VAT rate from the breakdown for customer-level calculation
        const dominantVat =
            stats.vatBreakdown.length > 0
                ? stats.vatBreakdown.reduce((prev, curr) => (curr.ca > prev.ca ? curr : prev)).vatRate
                : 0.1;

        const customers = aggregation.customers.map((c) => {
            const totalAmount = Number(c.meal_count) * employerShare;
            const totalHT = totalAmount / (1 + dominantVat);
            const totalTVA = totalAmount - totalHT;
            return {
                customerId: Number(c.customer_id),
                reference: String(c.reference ?? ''),
                firstName: String(c.first_name),
                lastName: String(c.last_name),
                mealCount: Number(c.meal_count),
                totalAmount: Number(totalAmount.toFixed(2)),
                totalHT: Number(totalHT.toFixed(2)),
                totalTVA: Number(totalTVA.toFixed(2)),
            };
        });

        // Aggregate from the already-rounded per-customer values so the grand total
        // always matches the sum of the detail rows (no 1-cent rounding drift).
        const mealCount = customers.reduce((sum, c) => sum + c.mealCount, 0);
        const totalAmount = Number(customers.reduce((sum, c) => sum + c.totalAmount, 0).toFixed(2));
        const totalHT = Number(customers.reduce((sum, c) => sum + c.totalHT, 0).toFixed(2));
        const totalTVA = Number(customers.reduce((sum, c) => sum + c.totalTVA, 0).toFixed(2));

        const report = {
            companyId: Number(company.id),
            companyName,
            companySiret: company.siret ?? undefined,
            companyVatNumber: company.vat_number ?? undefined,
            companyAddress: company.address ?? undefined,
            companyZipCode: company.zip_code ?? undefined,
            companyCity: company.city ?? undefined,
            startDate,
            endDate,
            employerShare,
            vatRate: dominantVat,
            mealCount,
            totalAmount,
            totalHT,
            totalTVA,
            customers,
            ticketCount: stats.ticketCount,
            customerPaidAmount: stats.customerPaidAmount,
            vatBreakdown: stats.vatBreakdown,
            ventilations: stats.ventilations,
            paymentTotals: stats.paymentTotals,
            refundCount: stats.refundCount,
        };

        return NextResponse.json({ report });
    } catch (error) {
        console.error('Error fetching billing report:', error);
        return NextResponse.json({ error: 'An error occurred while fetching the billing report' }, { status: 500 });
    } finally {
        if (connection) await connection.end();
    }
}
