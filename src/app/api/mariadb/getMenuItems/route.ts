import { Product } from '@/app/hooks/useData';
import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';

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
            SELECT f.nom AS label, f.prix AS amount, a.quantite as quantity, b.nom_categorie AS category
            FROM rel_panier_formule a
            JOIN rel_pf_ef b ON b.id_pf = a.id
            JOIN element_formule c ON c.id = b.id_ef
            JOIN rel_ef_formule d ON d.id_element_formule = c.id
            JOIN article e ON e.id = b.id_article
            JOIN formule f ON f.id = a.formule_id
            WHERE a.panier_id = ?
        `;

        const [rows] = await connection.execute(query, [orderId]);

        await connection.end();

        return NextResponse.json(rows as Product[], { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
