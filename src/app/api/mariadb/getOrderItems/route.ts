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

        // Query 1: Get articles
        const queryArticles = `
            SELECT a.nom AS label, a.prix as amount, b.quantite as quantity, c.nom AS category
            FROM article a
            JOIN rel_panier_article b ON b.article_id = a.id
            JOIN categorie c ON c.id = a.categorie
            WHERE b.panier_id = ?
        `;

        // Query 2: Get formules
        const queryFormules = `
            SELECT f.nom AS label, f.prix AS amount, a.quantite as quantity, 'Formule' AS category
            FROM rel_panier_formule a
            JOIN formule f ON f.id = a.formule_id
            WHERE a.panier_id = ?
        `;

        // Execute both queries
        const [articlesRows] = await connection.execute(queryArticles, [orderId]);
        const [formulesRows] = await connection.execute(queryFormules, [orderId]);

        await connection.end();

        console.log('articlesRows', articlesRows);
        console.log('formulesRows', formulesRows);

        // Combine and transform all rows into Product array
        const allRows = [...(articlesRows as any[]), ...(formulesRows as any[])];
        const products: Product[] = allRows.map((row) => ({
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
