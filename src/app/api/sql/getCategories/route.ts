import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface CategoryRow {
    id: string;
    name: string;
    sort_order: number;
    default_vat_rate: number | null;
}

export async function GET() {
    try {
        const connection = await getMainDb();

        const query = `
            SELECT id, name, sort_order, default_vat_rate
            FROM categories
            ORDER BY sort_order
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const data: { values: string[][] } = { values: [] };
        data.values.push(['Catégorie', 'TVA']);
        data.values.push(
            ...(rows as CategoryRow[]).map((row): string[] => [
                String(row.name),
                String(row.default_vat_rate ?? 20), // Use default_vat_rate from DB, default to 20
            ])
        );

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching categories' }, { status: 500 });
    }
}
