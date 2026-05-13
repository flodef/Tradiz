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
        for (let i = 0; i < (products as Product[]).length; i++) {
            const product = (products as Product[])[i];
            const sortOrder = i + 1;
            const price = parseFloat(product.currencies[0]) || 0;
            // stock=-1 means infinite (available), stock=0 means unavailable
            const stock = product.availability ? (product.stock === 0 ? -1 : product.stock) : 0;
            const vatRate = product.vat ?? null;
            const reference = product.reference ?? null;
            const photo = product.photo ?? '';
            const description = product.description ?? '';
            const categoryId = product.category; // category_id stores the category name

            // Update or insert the product
            if (connection.isPostgreSQL) {
                const [existing] = await connection.execute('SELECT id FROM dc.products WHERE name = $1', [
                    product.name,
                ]);
                const productRows = existing as { id: number }[];

                if (productRows.length > 0) {
                    await connection.execute(
                        'UPDATE dc.products SET price = $1, category_id = $2, stock = $3, vat_rate = $4, reference = $5, photo = $6, description = $7, sort_order = $8 WHERE name = $9',
                        [price, categoryId, stock, vatRate, reference, photo, description, sortOrder, product.name]
                    );
                } else {
                    await connection.execute(
                        'INSERT INTO dc.products (name, price, category_id, stock, reference, photo, description, sort_order, vat_rate) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                        [product.name, price, categoryId, stock, reference, photo, description, sortOrder, vatRate]
                    );
                }
            } else {
                const [existing] = await connection.execute('SELECT id FROM products WHERE name = ?', [product.name]);
                const productRows = existing as { id: number }[];

                if (productRows.length > 0) {
                    await connection.execute(
                        'UPDATE products SET price = ?, category_id = ?, stock = ?, vat_rate = ?, reference = ?, photo = ?, description = ?, sort_order = ? WHERE name = ?',
                        [price, categoryId, stock, vatRate, reference, photo, description, sortOrder, product.name]
                    );
                } else {
                    await connection.execute(
                        'INSERT INTO products (name, price, category_id, stock, reference, photo, description, sort_order, vat_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [product.name, price, categoryId, stock, reference, photo, description, sortOrder, vatRate]
                    );
                }
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating articles' }, { status: 500 });
    }
}
