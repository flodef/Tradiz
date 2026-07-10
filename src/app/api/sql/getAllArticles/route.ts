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

        // Currency columns follow the fixed product fields. Only Euro is supported for now.
        const currencies = ['Euro (€)'];

        const products = allRows.map((row) => ({
            rate: row.rate !== null ? Number(row.rate) / 100 : null,
            category: String(row.category),
            label: String(row.label),
            stock: row.stock !== null ? Number(row.stock) : null,
            reference: String(row.reference),
            photo: String(row.photo),
            description: String(row.description),
            prices: [Number(Number(row.amount).toFixed(2))],
            options: row.options || null,
        }));

        return NextResponse.json({ products, currencies }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
