import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface CategoryRow {
    id: string;
    nom: string;
    ordre: number;
    taux_tva_default: number | null;
}

export async function GET() {
    try {
        const connection = await getMainDb();

        const query = `
            SELECT id, nom, ordre, taux_tva_default
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
                String(row.taux_tva_default ?? 20), // Use taux_tva_default from DB, default to 20
            ])
        );

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching categories' }, { status: 500 });
    }
}
