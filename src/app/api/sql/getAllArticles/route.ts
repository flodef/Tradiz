import {} from '@/app/utils/extensions';
import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface ArticleRow {
    label: string;
    amount: string;
    rate: string;
    category: string;
    options: string;
    stock: number;
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
            SELECT a.name as label, a.price as amount, a.vat_rate as rate, b.name as category, a.options as options, a.stock as stock, a.reference as reference, a.photo as photo, a.description as description
            FROM dc.products a
            JOIN dc.categories b on b.name = a.category_id
        `
            : `
            SELECT a.name as label, a.price as amount, a.vat_rate as rate, b.name as category, a.options as options, a.stock as stock, a.reference as reference, a.photo as photo, a.description as description
            FROM products a
            JOIN categories b on b.name = a.category_id
        `;

        // Query 2: Get all formulas
        const queryFormulas = connection.isPostgreSQL
            ? `
            SELECT name as label, price as amount, '0.1' as rate, 'Formule' as category, '' as options, -1 as stock, '' as reference, '' as photo, '' as description
            FROM dc.formulas
        `
            : `
            SELECT name as label, price as amount, '0.1' as rate, 'Formule' as category, '' as options, -1 as stock, '' as reference, '' as photo, '' as description
            FROM formulas
        `;

        // Execute both queries
        const [productsRows] = await connection.execute(queryProducts);
        const [formulasRows] = await connection.execute(queryFormulas);

        await connection.end();

        // Combine all rows
        const allRows = [...(productsRows as ArticleRow[]), ...(formulasRows as ArticleRow[])];

        const data: { values: (number | string | boolean)[][]; options: (string | null)[] } = {
            values: [],
            options: [],
        };
        data.values.push(['Taux', 'Catégorie', 'Nom', 'Stock', 'Reference', 'Photo', 'Description', 'Euro (€)']);
        data.values.push(
            ...allRows.map((row): (number | string | boolean)[] => [
                Number(row.rate) / 100,
                String(row.category),
                String(row.label),
                Number(row.stock),
                String(row.reference || ''),
                String(row.photo || ''),
                String(row.description || ''),
                Number(Number(row.amount).toFixed(2)),
            ])
        );
        data.options = allRows.map((row) => row.options || null);

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
