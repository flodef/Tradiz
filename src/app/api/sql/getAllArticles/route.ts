import {} from '@/app/utils/extensions';
import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface ArticleRow {
    label: string;
    amount: string;
    rate: string;
    category: string;
    options: string;
    stock: number | null;
    reference: string;
    photo: string;
    description: string;
}

export async function GET() {
    try {
        const connection = await getMainDb();

        // Query 1: Get all products
        const queryProducts = connection.isPostgreSQL
            ? `
            SELECT name as label, price as amount, vat_rate as rate, category_id as category, options, stock, reference, photo, description
            FROM dc.products
            ORDER BY sort_order ASC
        `
            : `
            SELECT name as label, price as amount, vat_rate as rate, category_id as category, options, stock, reference, photo, description
            FROM products
            ORDER BY sort_order ASC
        `;

        // Query 2: Get all formulas
        const queryFormulas = connection.isPostgreSQL
            ? `
            SELECT name as label, price as amount, '0.1' as rate, 'Formule' as category, '' as options, NULL as stock, '' as reference, '' as photo, '' as description
            FROM dc.formulas
        `
            : `
            SELECT name as label, price as amount, '0.1' as rate, 'Formule' as category, '' as options, NULL as stock, '' as reference, '' as photo, '' as description
            FROM formulas
        `;

        // Execute both queries
        const [productsRows] = await connection.execute(queryProducts);
        const [formulasRows] = await connection.execute(queryFormulas);

        await connection.end();

        // Combine all rows
        const allRows = [...(productsRows as ArticleRow[]), ...(formulasRows as ArticleRow[])];

        // Log for debugging
        console.log(
            `[getAllArticles] Fetched ${allRows.length} rows (${(productsRows as ArticleRow[]).length} products, ${(formulasRows as ArticleRow[]).length} formulas)`
        );
        if (allRows.length > 0) {
            console.log('[getAllArticles] Sample row:', allRows[0]);
        }

        const data: { values: (number | string | boolean | null)[][]; options: (string | null)[] } = {
            values: [],
            options: [],
        };
        data.values.push(['Taux', 'Catégorie', 'Nom', 'Stock', 'Reference', 'Photo', 'Description', 'Euro (€)']);
        data.values.push(
            ...allRows.map((row): (number | string | boolean | null)[] => {
                // Ensure we always have exactly 8 columns, even if some data is missing
                return [
                    row.rate != null ? Number(row.rate) / 100 : null,
                    String(row.category || ''),
                    String(row.label || ''),
                    row.stock === null || row.stock === undefined ? null : Number(row.stock),
                    String(row.reference ?? ''),
                    String(row.photo ?? ''),
                    String(row.description ?? ''),
                    Number(Number(row.amount || 0).toFixed(2)),
                ];
            })
        );
        data.options = allRows.map((row) => row.options || null);

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
