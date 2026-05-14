import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface Product {
    name: string;
    category: string;
    stock: number | null;
    currencies: string[];
    vat?: number;
    reference?: string;
    photo?: string;
    description?: string;
    options?: string;
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
            // stock=null means unlimited, stock=0 means unavailable, stock>0 means specific quantity
            const stock = product.stock;
            const vatRate = product.vat ?? null;
            const reference = product.reference ?? null;
            const photo = product.photo ?? '';
            const description = product.description ?? '';
            const options = product.options ?? '';
            const categoryId = product.category; // category_id stores the category name

            // Update or insert the product
            if (connection.isPostgreSQL) {
                const [existing] = await connection.execute('SELECT id FROM dc.products WHERE name = $1', [
                    product.name,
                ]);
                const productRows = existing as { id: number }[];

                if (productRows.length > 0) {
                    await connection.execute(
                        'UPDATE dc.products SET price = $1, category_id = $2, stock = $3, vat_rate = $4, reference = $5, photo = $6, description = $7, sort_order = $8, options = $9 WHERE name = $10',
                        [
                            price,
                            categoryId,
                            stock,
                            vatRate,
                            reference,
                            photo,
                            description,
                            sortOrder,
                            options,
                            product.name,
                        ]
                    );
                } else {
                    await connection.execute(
                        'INSERT INTO dc.products (name, price, category_id, stock, reference, photo, description, sort_order, vat_rate, options) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
                        [
                            product.name,
                            price,
                            categoryId,
                            stock,
                            reference,
                            photo,
                            description,
                            sortOrder,
                            vatRate,
                            options,
                        ]
                    );
                }
            } else {
                const [existing] = await connection.execute('SELECT id FROM products WHERE name = ?', [product.name]);
                const productRows = existing as { id: number }[];

                if (productRows.length > 0) {
                    await connection.execute(
                        'UPDATE products SET price = ?, category_id = ?, stock = ?, vat_rate = ?, reference = ?, photo = ?, description = ?, sort_order = ?, options = ? WHERE name = ?',
                        [
                            price,
                            categoryId,
                            stock,
                            vatRate,
                            reference,
                            photo,
                            description,
                            sortOrder,
                            options,
                            product.name,
                        ]
                    );
                } else {
                    await connection.execute(
                        'INSERT INTO products (name, price, category_id, stock, reference, photo, description, sort_order, vat_rate, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [
                            product.name,
                            price,
                            categoryId,
                            stock,
                            reference,
                            photo,
                            description,
                            sortOrder,
                            vatRate,
                            options,
                        ]
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
