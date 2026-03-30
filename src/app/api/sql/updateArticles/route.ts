import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface Product {
    name: string;
    category: string;
    availability: boolean;
    currencies: string[];
}

export async function POST(request: Request) {
    try {
        const { products } = await request.json();

        if (!products || !Array.isArray(products)) {
            return NextResponse.json({ error: 'Invalid products format' }, { status: 400 });
        }

        const connection = await getMainDb();

        // Update each product
        for (const product of products as Product[]) {
            // First, get the category ID
            const [categoryRows] = await connection.execute(
                'SELECT id FROM categorie WHERE nom = ?',
                [product.category]
            );

            if ((categoryRows as any[]).length === 0) {
                console.warn(`Category not found: ${product.category}`);
                continue;
            }

            const categoryId = (categoryRows as any[])[0].id;
            const price = parseFloat(product.currencies[0]) || 0;
            const disponible = product.availability ? 1 : 0;

            // Update or insert the article
            const query = `
                INSERT INTO article (nom, prix, categorie, disponible, ordre)
                VALUES (?, ?, ?, ?, 999)
                ON DUPLICATE KEY UPDATE 
                    prix = VALUES(prix),
                    categorie = VALUES(categorie),
                    disponible = VALUES(disponible)
            `;
            
            await connection.execute(query, [product.name, price, categoryId, disponible]);
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating articles' }, { status: 500 });
    }
}
