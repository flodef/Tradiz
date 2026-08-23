import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb } from '../db';
import { generateProductReference } from '@/app/utils/productReference';
import { DEFAULT_VAT_RATE } from '@/app/utils/constants';
import { GRID_COLS, encodeGridPosition, encodeSortOrder } from '@/app/utils/sortOrder';

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
    color?: string;
    gridPosition?: number;
}

// Compute encoded sort_order: (categoryIndex + 1) * 10000 + positionWithinCategory
// Category order is derived from first appearance in the products array.
// Max 9999 products per category (position 0–9999).
//
// The encoding is the SAME for catalog and list modes — only the
// positionWithinCategory part differs:
//
//   Catalog mode (product has gridPosition 0–35):
//     positionWithinCategory = row * 100 + col
//     e.g. gridPosition 0 → 000, gridPosition 6 → 100, gridPosition 35 → 505
//     sort_order 120405 = category 12, row 4, col 5
//
//   List mode (no gridPosition):
//     positionWithinCategory = sequential index (0, 1, 2, …)
//     sort_order 120405 = category 12, position 405
//
// Both modes sort by sort_order ascending and produce the same relative order.
export function computeSortOrders(products: Product[]): number[] {
    const categoryOrder: string[] = [];
    for (const p of products) {
        if (!categoryOrder.includes(p.category)) categoryOrder.push(p.category);
    }

    // Detect which categories are in catalog mode (at least one product has gridPosition)
    const catalogCategories = new Set<string>();
    for (const p of products) {
        if (p.gridPosition != null && p.gridPosition >= 0) {
            catalogCategories.add(p.category);
        }
    }

    const usedPositions: Record<string, Set<number>> = {};
    const nextAuto: Record<string, number> = {};
    const nextAutoSlot: Record<string, number> = {};
    return products.map((p) => {
        const cat = p.category;
        if (!usedPositions[cat]) usedPositions[cat] = new Set();
        if (nextAuto[cat] === undefined) nextAuto[cat] = 0;
        if (nextAutoSlot[cat] === undefined) nextAutoSlot[cat] = 0;
        const catIdx = categoryOrder.indexOf(cat);
        const isCatalogMode = catalogCategories.has(cat);
        let pos: number;
        if (p.gridPosition != null && p.gridPosition >= 0) {
            // Convert gridPosition (row-major 0–35) to catalog position: row * 100 + col
            const catalogPos = encodeGridPosition(p.gridPosition);
            if (!usedPositions[cat].has(catalogPos)) {
                pos = catalogPos;
                usedPositions[cat].add(pos);
            } else {
                // Duplicate gridPosition — fall back to auto
                if (isCatalogMode) {
                    pos = nextAutoGridSlot(usedPositions[cat], nextAutoSlot, cat);
                } else {
                    pos = nextAutoSequential(usedPositions[cat], nextAuto, cat);
                }
                usedPositions[cat].add(pos);
            }
        } else {
            // Auto-assign: use grid slot encoding in catalog mode, sequential in list mode
            if (isCatalogMode) {
                pos = nextAutoGridSlot(usedPositions[cat], nextAutoSlot, cat);
            } else {
                pos = nextAutoSequential(usedPositions[cat], nextAuto, cat);
            }
            usedPositions[cat].add(pos);
        }
        return encodeSortOrder(catIdx, pos);
    });
}

// Find the next available sequential position (list mode).
function nextAutoSequential(used: Set<number>, nextAuto: Record<string, number>, cat: string): number {
    while (used.has(nextAuto[cat])) nextAuto[cat]++;
    const pos = nextAuto[cat];
    nextAuto[cat]++;
    return pos;
}

// Find the next available grid slot, encoded as row * 100 + col.
// Iterates through slots in row-major order: (0,0), (0,1), … (0,5), (1,0), (1,1), …
function nextAutoGridSlot(used: Set<number>, nextAutoSlot: Record<string, number>, cat: string): number {
    while (true) {
        const slot = nextAutoSlot[cat];
        const row = Math.floor(slot / GRID_COLS);
        const col = slot % GRID_COLS;
        const encoded = row * 100 + col;
        nextAutoSlot[cat]++;
        if (!used.has(encoded)) return encoded;
    }
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

        // Check for duplicate (name, category) pairs before writing.
        // Same name in different categories is allowed.
        const allProducts = products as Product[];
        const keys = allProducts.map(
            (p) => `${p.name.trim().toLowerCase()}\0${(p.category || '').trim().toLowerCase()}`
        );
        const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
        if (duplicates.length > 0) {
            const dupNames = [...new Set(duplicates.map((k) => k.split('\0')[0]))];
            return NextResponse.json(
                { error: `Produits en double (nom + catégorie) : "${dupNames.join(', ')}"` },
                { status: 409 }
            );
        }

        const sortOrders = computeSortOrders(products as Product[]);

        const pgTable = connection.isPostgreSQL ? 'dc.products' : 'products';
        const catTable = connection.isPostgreSQL ? 'dc.categories' : 'categories';

        await connection.beginTransaction();
        try {
            // Build a map of category name → category_id from the categories table
            const catQuery = `SELECT id, name FROM ${catTable}`;
            const [catRows] = await connection.execute(catQuery);
            const catMap = new Map<string, number>();
            for (const row of catRows as { id: number; name: string }[]) {
                catMap.set(String(row.name), Number(row.id));
            }

            if (scopedCategory !== null) {
                // Delete products whose category_id matches the scoped category name
                const catId = catMap.get(scopedCategory);
                if (catId !== undefined) {
                    await connection.execute(
                        `DELETE FROM ${pgTable} WHERE category_id = ${connection.isPostgreSQL ? '$1' : '?'}`,
                        [catId]
                    );
                }
            } else {
                await connection.execute(connection.isPostgreSQL ? 'DELETE FROM dc.products' : 'DELETE FROM products');
            }

            const allProducts = products as Product[];
            const productsToInsert =
                scopedCategory !== null ? allProducts.filter((p) => p.category === scopedCategory) : allProducts;

            // Build a Map from product object → sort order index to avoid O(n²) indexOf
            const sortOrderMap = new Map<Product, number>();
            for (let i = 0; i < allProducts.length; i++) {
                sortOrderMap.set(allProducts[i], sortOrders[i]);
            }

            const cols =
                'name, price, category_id, stock, reference, photo, description, sort_order, vat_rate, options, color';
            const rowValues: unknown[] = [];
            const placeholders: string[] = [];

            for (let i = 0; i < productsToInsert.length; i++) {
                const product = productsToInsert[i];
                const sortOrder = sortOrderMap.get(product) ?? i + 1;
                const price = parseFloat(product.currencies[0]) || 0;
                const stock = product.stock;
                const vatRate = product.vat ?? DEFAULT_VAT_RATE;
                const reference = product.reference?.trim() || generateProductReference(sortOrder);
                const photo = product.photo ?? '';
                const description = product.description ?? '';
                const options = product.options ?? '';
                const color = product.color ?? '';
                const categoryId = catMap.get(product.category) ?? null;

                const start = rowValues.length + 1;
                const row = connection.isPostgreSQL
                    ? Array.from({ length: 11 }, (_, j) => `$${start + j}`).join(', ')
                    : '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
                placeholders.push(`(${row})`);
                rowValues.push(
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
                    color
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
