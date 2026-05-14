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

        // Check for duplicate product names before writing
        const names = (products as Product[]).map((p) => p.name.trim().toLowerCase());
        const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
        if (duplicates.length > 0) {
            await connection.end();
            return NextResponse.json(
                { error: `Noms de produits en double : ${[...new Set(duplicates)].join(', ')}` },
                { status: 409 }
            );
        }

        // Delete all products and re-insert in a transaction to handle renames, deletions, and duplicates
        if (connection.isPostgreSQL) {
            await connection.execute('BEGIN');
            try {
                await connection.execute('TRUNCATE dc.products RESTART IDENTITY');
                for (let i = 0; i < (products as Product[]).length; i++) {
                    const product = (products as Product[])[i];
                    const sortOrder = i + 1;
                    const price = parseFloat(product.currencies[0]) || 0;
                    const stock = product.stock;
                    const vatRate = product.vat ?? 20;
                    const reference = product.reference ?? null;
                    const photo = product.photo ?? '';
                    const description = product.description ?? '';
                    const options = product.options ?? '';
                    const categoryId = product.category;

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
                await connection.execute('COMMIT');
            } catch (e) {
                await connection.execute('ROLLBACK');
                throw e;
            }
        } else {
            await connection.execute('START TRANSACTION');
            try {
                await connection.execute('TRUNCATE TABLE products');
                for (let i = 0; i < (products as Product[]).length; i++) {
                    const product = (products as Product[])[i];
                    const sortOrder = i + 1;
                    const price = parseFloat(product.currencies[0]) || 0;
                    const stock = product.stock;
                    const vatRate = product.vat ?? 20;
                    const reference = product.reference ?? null;
                    const photo = product.photo ?? '';
                    const description = product.description ?? '';
                    const options = product.options ?? '';
                    const categoryId = product.category;

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
                await connection.execute('COMMIT');
            } catch (e) {
                await connection.execute('ROLLBACK');
                throw e;
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating articles' }, { status: 500 });
    }
}
