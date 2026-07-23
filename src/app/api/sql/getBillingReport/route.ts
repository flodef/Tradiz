import { getShopIdFromRequest } from '@/app/constants/shop';
import { DEFAULT_VAT_RATE } from '@/app/utils/constants';
import { toSQLDateTime } from '@/app/utils/date';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';
import { ensureBillingSchema, aggregateMealsByCustomer } from '../billingHelpers';

function normalizeVatRate(raw: number): number {
    return raw >= 1 ? raw / 100 : raw;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get('companyName');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const vatParam = searchParams.get('vatRate');
    const vatRate = normalizeVatRate(vatParam ? Number(vatParam) : DEFAULT_VAT_RATE);

    if (!companyName || !startDate || !endDate || isNaN(vatRate)) {
        return NextResponse.json(
            { error: 'Missing or invalid companyName, startDate, endDate or vatRate' },
            { status: 400 }
        );
    }

    try {
        const connection = await getPosDb(shopId);
        await ensureBillingSchema(connection);

        const companyQuery = connection.isPostgreSQL
            ? 'SELECT id, meal_price FROM dc_pos.companies WHERE name = $1'
            : 'SELECT id, meal_price FROM companies WHERE name = ?';
        const [companyRows] = await connection.execute(companyQuery, [companyName]);
        const company = (companyRows as { id: number; meal_price: number }[])[0];

        if (!company) {
            await connection.end();
            return NextResponse.json({ error: 'Company not found' }, { status: 404 });
        }

        const mealPrice = Number(company.meal_price ?? 0);
        if (mealPrice <= 0) {
            await connection.end();
            return NextResponse.json({ error: 'Company meal price is not set' }, { status: 400 });
        }

        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');
        const startAt = toSQLDateTime(start);
        const endAt = toSQLDateTime(end);

        const aggregation = await aggregateMealsByCustomer(connection, companyName, startAt, endAt);

        await connection.end();

        const customers = aggregation.customers.map((c) => {
            const totalAmount = Number(c.meal_count) * mealPrice;
            const totalHT = totalAmount / (1 + vatRate);
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

        const mealCount = customers.reduce((sum, c) => sum + c.mealCount, 0);
        const totalAmount = Number((mealCount * mealPrice).toFixed(2));
        const totalHT = Number((totalAmount / (1 + vatRate)).toFixed(2));
        const totalTVA = Number((totalAmount - totalHT).toFixed(2));

        const report = {
            companyId: Number(company.id),
            companyName,
            startDate,
            endDate,
            mealPrice,
            vatRate,
            mealCount,
            totalAmount,
            totalHT,
            totalTVA,
            customers,
        };

        return NextResponse.json({ report });
    } catch (error) {
        console.error('Error fetching billing report:', error);
        return NextResponse.json({ error: 'An error occurred while fetching the billing report' }, { status: 500 });
    }
}
