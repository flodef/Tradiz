import {} from '@/app/utils/extensions';
import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Connection configuration for MariaDB
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        // SQL query with parameterized query for security
        const query = `
            SELECT a.nom as label, a.prix as amount, a.taux_tva as rate, b.nom as category, a.options as options
            FROM article a
            JOIN categorie b on b.id = a.categorie
        `;

        const [rows] = await connection.execute(query);

        await connection.end();

        const data: { values: (number | string | boolean)[][] } = { values: [] };
        data.values.push(['Taux', 'Catégorie', 'Nom', 'Indisponible', 'Euro (€)']);
        data.values.push(
            ...(rows as any[]).map((row): (number | string | boolean)[] => [
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
