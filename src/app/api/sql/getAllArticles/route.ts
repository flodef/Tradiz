import {} from '@/app/utils/extensions';
import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface ArticleRow {
    label: string;
    amount: string;
    rate: string;
    category: string;
    options: string;
    disponible: number;
    stock: number;
}

export async function GET() {
    try {
        const connection = await getMainDb();

        // Query 1: Get all products
        const queryProducts = connection.isPostgreSQL
            ? `
            SELECT a.nom as label, a.prix as amount, a.taux_tva as rate, b.nom as category, a.options as options, a.disponible as disponible, a.stock as stock
            FROM dc.products a
            JOIN dc.categories b on b.id = a.categorie
        `
            : `
            SELECT a.nom as label, a.prix as amount, a.taux_tva as rate, b.nom as category, a.options as options, a.disponible as disponible, a.stock as stock
            FROM products a
            JOIN categories b on b.id = a.categorie
        `;

        // Query 2: Get all formulas
        const queryFormulas = connection.isPostgreSQL
            ? `
            SELECT nom as label, prix as amount, '0.1' as rate, 'Formule' as category, '' as options, 1 as disponible, 0 as stock
            FROM dc.formulas
        `
            : `
            SELECT nom as label, prix as amount, '0.1' as rate, 'Formule' as category, '' as options, 1 as disponible, 0 as stock
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
        data.values.push(['Taux', 'Catégorie', 'Nom', 'Indisponible', 'Euro (€)', 'Stock']);
        data.values.push(
            ...allRows.map((row): (number | string | boolean)[] => [
                Number(row.rate) / 100,
                String(row.category),
                String(row.label),
                !row.disponible, // disponible=1 means available, so Indisponible=!disponible
                Number(Number(row.amount).toFixed(2)),
                Number(row.stock),
            ])
        );
        data.options = allRows.map((row) => row.options || null);

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
