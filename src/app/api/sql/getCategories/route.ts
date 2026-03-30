import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface CategoryRow {
    id: string;
    nom: string;
    ordre: number;
}

export async function GET() {
    try {
        const connection = await getMainDb();

        const query = `
            SELECT id, nom, ordre
            FROM categorie
            ORDER BY ordre
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const data: { values: string[][] } = { values: [] };
        data.values.push(['Catégorie', 'TVA']);
        data.values.push(
            ...(rows as CategoryRow[]).map((row): string[] => [
                String(row.nom),
                '20', // Default VAT rate, you can adjust this if you have a taux_tva field
            ])
        );

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching categories' }, { status: 500 });
    }
}
