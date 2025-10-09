import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
        return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

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

        console.log(rows);

        await connection.end();

        return NextResponse.json(rows, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
