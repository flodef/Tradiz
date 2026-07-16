import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb } from '../db';
import { generateProductReference } from '@/app/utils/productReference';
import { DEFAULT_VAT_RATE } from '@/app/utils/constants';

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
export function computeSortOrders(products: Product[]): number[] {
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
    const shopId = getShopIdFromRequest(request);
    let connection: Awaited<ReturnType<typeof getMainDb>> | undefined;

    try {
        const { products, category } = await request.json();

        if (!products || !Array.isArray(products)) {
            return NextResponse.json({ error: 'Invalid products format' }, { status: 400 });
        }

        const scopedCategory = typeof category === 'string' ? category : null;

        // Refuse a full replace with an empty product list — that would TRUNCATE the whole catalog.
        // Empty category-scoped saves are still allowed (delete a single category).
        if (products.length === 0 && scopedCategory === null) {
            return NextResponse.json({ error: 'Empty product list' }, { status: 400 });
        }

        connection = await getMainDb(shopId);

        // Check for duplicate product names before writing
        const names = (products as Product[]).map((p) => p.name.trim().toLowerCase());
        const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
        if (duplicates.length > 0) {
            return NextResponse.json(
                { error: `Noms de produits en double : "${[...new Set(duplicates)].join(', ')}"` },
                { status: 409 }
            );
        }

        const sortOrders = computeSortOrders(products as Product[]);

        const pgTable = connection.isPostgreSQL ? 'dc.products' : 'products';

        await connection.beginTransaction();
        try {
            if (scopedCategory !== null) {
                await connection.execute(
                    `DELETE FROM ${pgTable} WHERE category = ${connection.isPostgreSQL ? '$1' : '?'}`,
                    [scopedCategory]
                );
            } else {
                await connection.execute(connection.isPostgreSQL ? 'DELETE FROM dc.products' : 'DELETE FROM products');
            }

            const productsToInsert =
                scopedCategory !== null
                    ? (products as Product[]).filter((p) => p.category === scopedCategory)
                    : (products as Product[]);

            const cols = 'name, price, category, stock, reference, photo, description, sort_order, vat_rate, options';
            const rowValues: unknown[] = [];
            const placeholders: string[] = [];

            for (let i = 0; i < productsToInsert.length; i++) {
                const product = productsToInsert[i];
                const globalIdx = (products as Product[]).indexOf(product);
                const sortOrder = sortOrders[globalIdx];
                const price = parseFloat(product.currencies[0]) || 0;
                const stock = product.stock;
                const vatRate = product.vat ?? DEFAULT_VAT_RATE;
                const reference = product.reference ?? generateProductReference(sortOrder);
                const photo = product.photo ?? '';
                const description = product.description ?? '';
                const options = product.options ?? '';

                const start = rowValues.length + 1;
                const row = connection.isPostgreSQL
                    ? Array.from({ length: 10 }, (_, j) => `$${start + j}`).join(', ')
                    : '?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
                placeholders.push(`(${row})`);
                rowValues.push(
                    product.name,
                    price,
                    product.category,
                    stock,
                    reference,
                    photo,
                    description,
                    sortOrder,
                    vatRate,
                    options
                );
            }

            if (placeholders.length > 0) {
                const insertQuery = `INSERT INTO ${pgTable} (${cols}) VALUES ${placeholders.join(', ')}`;
                await connection.execute(insertQuery, rowValues);
            }

            await connection.commit();
        } catch (e) {
            await connection.rollback();
            throw e;
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        const msg =
            error instanceof Error && error.message.toLowerCase().includes('timeout')
                ? 'La connexion à la base de données a expiré. Veuillez réessayer.'
                : 'Une erreur est survenue lors de la mise à jour des produits.';
        return NextResponse.json({ error: msg }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
