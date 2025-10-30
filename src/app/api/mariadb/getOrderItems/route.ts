import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';
import { Product, EmptyDiscount } from '@/app/utils/interfaces';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

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
            SELECT a.nom AS label, a.prix as amount, b.quantite as quantity, c.nom AS category
            FROM article a
            JOIN rel_panier_article b ON b.article_id = a.id
            JOIN categorie c ON c.id = a.categorie
            WHERE b.panier_id = ?
        `;

        const [rows] = await connection.execute(query, [orderId]);

        await connection.end();

        // Transform rows into Product array
        const products: Product[] = (rows as any[]).map((row) => ({
            label: String(row.label),
            category: String(row.category),
            quantity: Number(row.quantity),
            amount: Number(Number(row.amount).toFixed(2)),
            discount: EmptyDiscount,
        }));

        return NextResponse.json(products, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
