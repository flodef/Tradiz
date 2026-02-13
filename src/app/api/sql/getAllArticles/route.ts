import {} from '@/app/utils/extensions';
import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

export async function GET() {
    try {
        const connection = await getMainDb();

        // Query 1: Get all articles
        const queryArticles = `
            SELECT a.nom as label, a.prix as amount, a.taux_tva as rate, b.nom as category, a.options as options
            FROM article a
            JOIN categorie b on b.id = a.categorie
        `;

        // Query 2: Get all formulas
        const queryFormules = `
            SELECT nom as label, prix as amount, '0.1' as rate, 'Formule' as category, '' as options
            FROM formule
        `;

        // Execute both queries
        const [articlesRows] = await connection.execute(queryArticles);
        const [formulesRows] = await connection.execute(queryFormules);

        await connection.end();

        // Combine all rows
        const allRows = [...(articlesRows as any[]), ...(formulesRows as any[])];

        const data: { values: (number | string | boolean)[][] } = { values: [] };
        data.values.push(['Taux', 'Catégorie', 'Nom', 'Indisponible', 'Euro (€)']);
        data.values.push(
            ...allRows.map((row): (number | string | boolean)[] => [
                Number(row.rate) / 100,
                String(row.category),
                String(row.label),
                false,
                Number(Number(row.amount).toFixed(2)),
            ])
        );

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
