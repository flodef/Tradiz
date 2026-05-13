import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface Product {
    name: string;
    category: string;
    availability: boolean;
    stock: number;
    currencies: string[];
    vat?: number;
    reference?: string;
    photo?: string;
    description?: string;
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
            const categoryQuery = connection.isPostgreSQL
                ? 'SELECT id FROM dc.categories WHERE name = $1'
                : 'SELECT id FROM categories WHERE name = ?';
            const [categoryRows] = await connection.execute(categoryQuery, [product.category]);

            const rows = categoryRows as { id: string }[];
            if (rows.length === 0) {
                console.warn(`Category not found: ${product.category}`);
                continue;
            }

            const categoryId = rows[0].id;
            const price = parseFloat(product.currencies[0]) || 0;
            const available = product.availability ? 1 : 0;
            const stock = product.stock ?? 0;
            const vatRate = product.vat ?? null;
            const reference = product.reference ?? null;
            const photo = product.photo ?? '';
            const description = product.description ?? '';

            // Update or insert the product
            if (connection.isPostgreSQL) {
                // PostgreSQL: Check if product exists, then update or insert
                const [existing] = await connection.execute('SELECT id FROM dc.products WHERE name = $1', [
                    product.name,
                ]);
                const productRows = existing as { id: string }[];

                if (productRows.length > 0) {
                    // Update existing
                    await connection.execute(
                        'UPDATE dc.products SET price = $1, category_id = $2, available = $3, stock = $4, vat_rate = $5, reference = $6, photo = $7, description = $8 WHERE name = $9',
                        [price, categoryId, available, stock, vatRate, reference, photo, description, product.name]
                    );
                } else {
                    // Insert new
                    await connection.execute(
                        'INSERT INTO dc.products (name, price, category_id, available, stock, reference, photo, description, sort_order, vat_rate) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 999, $9)',
                        [product.name, price, categoryId, available, stock, reference, photo, description, vatRate]
                    );
                }
            } else {
                // MariaDB: Use ON DUPLICATE KEY UPDATE
                const query = `
                    INSERT INTO products (name, price, category_id, available, stock, reference, photo, description, sort_order, vat_rate)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 999, ?)
                    ON DUPLICATE KEY UPDATE
                        price = VALUES(price),
                        category_id = VALUES(category_id),
                        available = VALUES(available),
                        stock = VALUES(stock),
                        reference = VALUES(reference),
                        photo = VALUES(photo),
                        description = VALUES(description),
                        vat_rate = VALUES(vat_rate)
                `;
                await connection.execute(query, [
                    product.name,
                    price,
                    categoryId,
                    available,
                    stock,
                    reference,
                    photo,
                    description,
                    vatRate,
                ]);
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating articles' }, { status: 500 });
    }
}
