import { ProductData } from '@/app/utils/processData';
import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
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

        console.log(query);

        const [rows] = await connection.execute(query);

        console.log(rows);

        const data: ProductData = {
            products: (rows as any[]).map((row) => ({
                rate: Number(row.rate) * 100,
                category: String(row.category ?? ''),
                label: String(row.label ?? ''),
                prices: [Number(row.amount) ?? 0],
            })),
            currencies: ['€'],
        };

        console.log(data);

        await connection.end();

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
