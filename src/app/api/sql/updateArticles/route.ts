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

// Compute encoded sort_order: (categoryIndex + 1) * 10000 + (positionWithinCategory + 1)
// Category order is derived from first appearance in the products array.
// Max 9999 products per category.
function computeSortOrders(products: Product[]): number[] {
    const categoryOrder: string[] = [];
    for (const p of products) {
        if (!categoryOrder.includes(p.category)) categoryOrder.push(p.category);
    }
    const positionInCat: Record<string, number> = {};
    return products.map((p) => {
        const catIdx = categoryOrder.indexOf(p.category);
        const pos = positionInCat[p.category] ?? 0;
        positionInCat[p.category] = pos + 1;
        return (catIdx + 1) * 10000 + (pos + 1);
    });
}

export async function POST(request: Request) {
    try {
        const { products, category } = await request.json();

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
                { error: `Noms de produits en double : "${[...new Set(duplicates)].join(', ')}"` },
                { status: 409 }
            );
        }

        const sortOrders = computeSortOrders(products as Product[]);

        // When a category is provided, scope the delete to that category only.
        // Otherwise do a full truncate+reinsert.
        const scopedCategory = typeof category === 'string' ? category : null;

        const pgTable = connection.isPostgreSQL ? 'dc.products' : 'products';

        await connection.beginTransaction();
        try {
            if (scopedCategory !== null) {
                await connection.execute(
                    `DELETE FROM ${pgTable} WHERE category_id = ${connection.isPostgreSQL ? '$1' : '?'}`,
                    [scopedCategory]
                );
            } else {
                await connection.execute(
                    connection.isPostgreSQL ? 'TRUNCATE dc.products RESTART IDENTITY' : 'TRUNCATE TABLE products'
                );
            }

            const productsToInsert =
                scopedCategory !== null
                    ? (products as Product[]).filter((p) => p.category === scopedCategory)
                    : (products as Product[]);

            for (let i = 0; i < productsToInsert.length; i++) {
                const product = productsToInsert[i];
                const globalIdx = (products as Product[]).indexOf(product);
                const sortOrder = sortOrders[globalIdx];
                const price = parseFloat(product.currencies[0]) || 0;
                const stock = product.stock;
                const vatRate = product.vat ?? 20;
                const reference = product.reference ?? null;
                const photo = product.photo ?? '';
                const description = product.description ?? '';
                const options = product.options ?? '';

                const cols =
                    'name, price, category_id, stock, reference, photo, description, sort_order, vat_rate, options';
                const vals = connection.isPostgreSQL
                    ? '$1, $2, $3, $4, $5, $6, $7, $8, $9, $10'
                    : '?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
                await connection.execute(`INSERT INTO ${pgTable} (${cols}) VALUES (${vals})`, [
                    product.name,
                    price,
                    product.category,
                    stock,
                    reference,
                    photo,
                    description,
                    sortOrder,
                    vatRate,
                    options,
                ]);
            }

            await connection.commit();
        } catch (e) {
            await connection.rollback();
            throw e;
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        const msg =
            error instanceof Error && error.message.toLowerCase().includes('timeout')
                ? 'La connexion à la base de données a expiré. Veuillez réessayer.'
                : 'Une erreur est survenue lors de la mise à jour des produits.';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
