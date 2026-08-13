import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb, executeInsert } from '../db';

interface FormulaElement {
    name: string;
    category?: string;
    products?: string[];
}

interface Formula {
    name: string;
    price: string;
    category: string;
    elements: FormulaElement[];
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: Awaited<ReturnType<typeof getMainDb>> | undefined;
    try {
        connection = await getMainDb(shopId);

        const body: Formula[] = await request.json();

        // Start transaction
        await connection.beginTransaction();

        // Delete all existing formulas and their relations (in correct order to avoid FK constraints)
        const deleteProductRelationsQuery = connection.isPostgreSQL
            ? `DELETE FROM dc.rel_formula_element_product`
            : `DELETE FROM rel_formula_element_product`;
        await connection.execute(deleteProductRelationsQuery);

        const deleteElementRelationsQuery = connection.isPostgreSQL
            ? `DELETE FROM dc.rel_formula_element_formula`
            : `DELETE FROM rel_formula_element_formula`;
        await connection.execute(deleteElementRelationsQuery);

        const deleteElementsQuery = connection.isPostgreSQL
            ? `DELETE FROM dc.formula_elements`
            : `DELETE FROM formula_elements`;
        await connection.execute(deleteElementsQuery);

        const deleteFormulasQuery = connection.isPostgreSQL ? `DELETE FROM dc.formulas` : `DELETE FROM formulas`;
        await connection.execute(deleteFormulasQuery);

        // Insert new formulas
        for (let formulaIndex = 0; formulaIndex < body.length; formulaIndex++) {
            const formula = body[formulaIndex];

            // Resolve category_id from category name
            let categoryId: number | null = null;
            if (formula.category) {
                const findCategoryQuery = connection.isPostgreSQL
                    ? `SELECT id FROM dc.categories WHERE name = $1 LIMIT 1`
                    : `SELECT id FROM categories WHERE name = ? LIMIT 1`;
                const [catRows] = await connection.execute(findCategoryQuery, [formula.category]);
                const cats = catRows as { id: number }[];
                if (cats.length > 0) categoryId = cats[0].id;
            }

            const insertFormulaQuery = connection.isPostgreSQL
                ? `INSERT INTO dc.formulas (name, price, sort_order, category_id) VALUES ($1, $2, $3, $4) RETURNING id`
                : `INSERT INTO formulas (name, price, sort_order, category_id) VALUES (?, ?, ?, ?)`;

            const formulaId = await executeInsert(connection, insertFormulaQuery, insertFormulaQuery, [
                formula.name,
                parseFloat(formula.price) || 0,
                formulaIndex,
                categoryId,
            ]);
            if (formulaId === undefined) throw new Error(`Failed to insert formula: ${formula.name}`);

            // Insert formula elements and relations
            for (let elementIndex = 0; elementIndex < formula.elements.length; elementIndex++) {
                const element = formula.elements[elementIndex];
                const insertElementQuery = connection.isPostgreSQL
                    ? `INSERT INTO dc.formula_elements (name, category) VALUES ($1, $2) RETURNING id`
                    : `INSERT INTO formula_elements (name, category) VALUES (?, ?)`;

                const elementId = await executeInsert(connection, insertElementQuery, insertElementQuery, [
                    element.name,
                    element.category || null,
                ]);
                if (elementId === undefined) throw new Error(`Failed to insert formula element: ${element.name}`);

                // Link element to formula
                const linkElementQuery = connection.isPostgreSQL
                    ? `INSERT INTO dc.rel_formula_element_formula (formula_id, formula_element_id, sort_order) VALUES ($1, $2, $3)`
                    : `INSERT INTO rel_formula_element_formula (formula_id, formula_element_id, sort_order) VALUES (?, ?, ?)`;
                await connection.execute(linkElementQuery, [formulaId, elementId, elementIndex]);

                // If element has specific products, link them
                if (element.products && element.products.length > 0) {
                    for (let productIndex = 0; productIndex < element.products.length; productIndex++) {
                        const productName = element.products[productIndex];
                        if (!productName.trim()) continue;

                        // Find product by name
                        const findProductQuery = connection.isPostgreSQL
                            ? `SELECT id FROM dc.products WHERE name = $1 LIMIT 1`
                            : `SELECT id FROM products WHERE name = ? LIMIT 1`;

                        const [productRows] = await connection.execute(findProductQuery, [productName.trim()]);
                        const products = productRows as { id: number }[];

                        if (products.length > 0) {
                            const productId = products[0].id;
                            const linkProductQuery = connection.isPostgreSQL
                                ? `INSERT INTO dc.rel_formula_element_product (formula_element_id, product_id, sort_order) VALUES ($1, $2, $3)`
                                : `INSERT INTO rel_formula_element_product (formula_element_id, product_id, sort_order) VALUES (?, ?, ?)`;
                            await connection.execute(linkProductQuery, [elementId, productId, productIndex]);
                        } else {
                            console.warn('[updateFormulas] Product not found:', productName);
                        }
                    }
                }
            }
        }

        await connection.commit();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        await connection?.rollback();
        console.error('[updateFormulas] Error:', error instanceof Error ? error.message : String(error));
        return NextResponse.json(
            {
                error: 'An error occurred while saving formulas',
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    } finally {
        await connection?.end();
    }
}
