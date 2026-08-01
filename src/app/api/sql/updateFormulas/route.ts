import {} from '@/app/utils/extensions';
import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface FormulaElement {
    name: string;
    category?: string;
    products?: string[];
}

interface Formula {
    name: string;
    price: string;
    elements: FormulaElement[];
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: Awaited<ReturnType<typeof getMainDb>> | undefined;
    try {
        connection = await getMainDb(shopId);

        const body: Formula[] = await request.json();
        console.log('Saving formulas:', JSON.stringify(body, null, 2));

        // Start transaction
        await connection.beginTransaction();

        // Delete all existing formulas and their relations (in correct order to avoid FK constraints)
        const deleteProductRelationsQuery = connection.isPostgreSQL
            ? `DELETE FROM dc.rel_formula_element_product`
            : `DELETE FROM rel_formula_element_product`;
        await connection.execute(deleteProductRelationsQuery);
        console.log('Deleted product relations');

        const deleteElementRelationsQuery = connection.isPostgreSQL
            ? `DELETE FROM dc.rel_formula_element_formula`
            : `DELETE FROM rel_formula_element_formula`;
        await connection.execute(deleteElementRelationsQuery);
        console.log('Deleted element relations');

        const deleteElementsQuery = connection.isPostgreSQL
            ? `DELETE FROM dc.formula_elements`
            : `DELETE FROM formula_elements`;
        await connection.execute(deleteElementsQuery);
        console.log('Deleted formula elements');

        const deleteFormulasQuery = connection.isPostgreSQL ? `DELETE FROM dc.formulas` : `DELETE FROM formulas`;
        await connection.execute(deleteFormulasQuery);
        console.log('Deleted existing formulas');

        // Insert new formulas
        for (let formulaIndex = 0; formulaIndex < body.length; formulaIndex++) {
            const formula = body[formulaIndex];
            console.log('Inserting formula:', formula.name);
            const insertFormulaQuery = connection.isPostgreSQL
                ? `INSERT INTO dc.formulas (name, price, sort_order) VALUES ($1, $2, $3) RETURNING id`
                : `INSERT INTO formulas (name, price, sort_order) VALUES (?, ?, ?)`;

            const [result] = await connection.execute(insertFormulaQuery, [
                formula.name,
                parseFloat(formula.price) || 0,
                formulaIndex,
            ]);

            const formulaId = connection.isPostgreSQL
                ? (result as { id: number }[])[0]?.id
                : (result as unknown as { insertId: number }).insertId;
            console.log('Formula inserted with ID:', formulaId);

            // Insert formula elements and relations
            for (let elementIndex = 0; elementIndex < formula.elements.length; elementIndex++) {
                const element = formula.elements[elementIndex];
                console.log('Inserting element:', element.name);
                // Insert formula element
                const insertElementQuery = connection.isPostgreSQL
                    ? `INSERT INTO dc.formula_elements (name, category) VALUES ($1, $2) RETURNING id`
                    : `INSERT INTO formula_elements (name, category) VALUES (?, ?)`;

                const [elementResult] = await connection.execute(insertElementQuery, [
                    element.name,
                    element.category || null,
                ]);

                const elementId = connection.isPostgreSQL
                    ? (elementResult as { id: number }[])[0]?.id
                    : (elementResult as unknown as { insertId: number }).insertId;
                console.log('Element inserted with ID:', elementId);

                // Link element to formula
                const linkElementQuery = connection.isPostgreSQL
                    ? `INSERT INTO dc.rel_formula_element_formula (formula_id, formula_element_id, sort_order) VALUES ($1, $2, $3)`
                    : `INSERT INTO rel_formula_element_formula (formula_id, formula_element_id, sort_order) VALUES (?, ?, ?)`;
                await connection.execute(linkElementQuery, [formulaId, elementId, elementIndex]);
                console.log('Linked element to formula');

                // If element has specific products, link them
                if (element.products && element.products.length > 0) {
                    console.log('Linking products:', element.products);
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
                            console.log('Linked product:', productName, 'to element');
                        } else {
                            console.warn('Product not found:', productName);
                        }
                    }
                }
            }
        }

        await connection.commit();
        console.log('Transaction committed successfully');

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        await connection?.rollback();
        console.error('Error saving formulas:', error);
        console.error('Error details:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error) {
            console.error('Stack trace:', error.stack);
        }
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
