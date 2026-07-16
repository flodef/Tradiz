import {} from '@/app/utils/extensions';
import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface ArticleRow {
    label: string;
    amount: string;
    rate: string;
    category: string;
    options: string;
    stock: number | null;
    reference: string | null;
    photo: string;
    description: string;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: Awaited<ReturnType<typeof getMainDb>> | undefined;
    try {
        connection = await getMainDb(shopId);

        // Query 1: Get all products
        const queryProducts = connection.isPostgreSQL
            ? `
            SELECT name as label, price as amount, vat_rate as rate, category, options, stock, reference, photo, description
            FROM dc.products
            ORDER BY sort_order ASC
        `
            : `
            SELECT name as label, price as amount, vat_rate as rate, category, options, stock, reference, photo, description
            FROM products
            ORDER BY sort_order ASC
        `;

        // Query 2: Get all formulas
        const queryFormulas = connection.isPostgreSQL
            ? `
            SELECT name as label, price as amount, '20' as rate, 'Formule' as category, '' as options, NULL as stock, '' as reference, '' as photo, '' as description
            FROM dc.formulas
        `
            : `
            SELECT name as label, price as amount, '20' as rate, 'Formule' as category, '' as options, NULL as stock, '' as reference, '' as photo, '' as description
            FROM formulas
        `;

        // Execute both queries. The products query is required; the formulas query is
        // optional - if the formulas table doesn't exist we still return the catalog.
        const [productsRows] = await connection.execute(queryProducts);
        let formulasRows: unknown[] = [];
        try {
            const [rows] = await connection.execute(queryFormulas);
            formulasRows = rows as unknown[];
        } catch (formulaError) {
            console.warn('Could not load formulas, continuing without them:', formulaError);
        }

        // Combine all rows
        const allRows = [...(productsRows as ArticleRow[]), ...(formulasRows as ArticleRow[])];

        // Currency columns follow the fixed product fields. Only Euro is supported for now.
        const currencies = ['Euro (€)'];

        const products = allRows.map((row) => {
            const rate = row.rate != null ? Number(row.rate) / 100 : null;
            const price = Number((Number(row.amount) || 0).toFixed(2));
            return {
                rate: rate !== null && Number.isFinite(rate) ? rate : null,
                category: String(row.category),
                label: String(row.label),
                stock: row.stock != null ? Number(row.stock) : null,
                reference: row.reference != null ? String(row.reference) : null,
                photo: String(row.photo),
                description: String(row.description),
                prices: [Number.isFinite(price) ? price : 0],
                options: row.options || null,
            };
        });

        return NextResponse.json({ products, currencies }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
