import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

export const dynamic = 'force-dynamic';

interface ArticleRow {
    label: string;
    amount: string;
    rate: string;
    category: string;
    options: string;
    stock: number | null;
    reference: string | null;
    photo: string;
    description: string;
    color: string;
    sort_order: number;
}

interface FormulaElement {
    name: string;
    category: string | null;
    products: string[];
}

interface FormulaData {
    label: string;
    amount: string;
    rate: string;
    category: string;
    color: string;
    elements: Map<number, FormulaElement>;
}

interface FormulaRow {
    label: string;
    amount: string;
    rate: string;
    category: string;
    color: string;
    formula_id: number;
    element_id: number | null;
    element_name: string | null;
    element_category: string | null;
    product_name: string | null;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: Awaited<ReturnType<typeof getMainDb>> | undefined;
    try {
        connection = await getMainDb(shopId);

        // Query 1: Get all products (JOIN categories to get category name)
        const queryProducts = connection.isPostgreSQL
            ? `
            SELECT p.name as label, p.price as amount, p.vat_rate as rate,
                   COALESCE(c.name, '') as category, p.options, p.stock, p.reference,
                   p.photo, p.description, p.color, p.sort_order
            FROM dc.products p
            LEFT JOIN dc.categories c ON p.category_id = c.id
            ORDER BY p.sort_order ASC
        `
            : `
            SELECT p.name as label, p.price as amount, p.vat_rate as rate,
                   COALESCE(c.name, '') as category, p.options, p.stock, p.reference,
                   p.photo, p.description, p.color, p.sort_order
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.sort_order ASC
        `;

        // Query 2: Get all formulas with their elements (JOIN categories for formula category)
        const queryFormulas = connection.isPostgreSQL
            ? `
            SELECT
                f.name as label,
                f.price as amount,
                '20' as rate,
                COALESCE(fc.name, 'Formule') as category,
                f.color as color,
                NULL as options,
                NULL as stock,
                '' as reference,
                '' as photo,
                '' as description,
                f.id as formula_id,
                fe.id as element_id,
                fe.name as element_name,
                fe.category as element_category,
                p.name as product_name
            FROM dc.formulas f
            LEFT JOIN dc.categories fc ON f.category_id = fc.id
            LEFT JOIN dc.rel_formula_element_formula ref ON f.id = ref.formula_id
            LEFT JOIN dc.formula_elements fe ON ref.formula_element_id = fe.id
            LEFT JOIN dc.rel_formula_element_product rep ON fe.id = rep.formula_element_id
            LEFT JOIN dc.products p ON rep.product_id = p.id
            ORDER BY f.sort_order, ref.sort_order, rep.sort_order
        `
            : `
            SELECT
                f.name as label,
                f.price as amount,
                '20' as rate,
                COALESCE(fc.name, 'Formule') as category,
                f.color as color,
                NULL as options,
                NULL as stock,
                '' as reference,
                '' as photo,
                '' as description,
                f.id as formula_id,
                fe.id as element_id,
                fe.name as element_name,
                fe.category as element_category,
                p.name as product_name
            FROM formulas f
            LEFT JOIN categories fc ON f.category_id = fc.id
            LEFT JOIN rel_formula_element_formula ref ON f.id = ref.formula_id
            LEFT JOIN formula_elements fe ON ref.formula_element_id = fe.id
            LEFT JOIN rel_formula_element_product rep ON fe.id = rep.formula_element_id
            LEFT JOIN products p ON rep.product_id = p.id
            ORDER BY f.sort_order, ref.sort_order, rep.sort_order
        `;

        // Execute both queries. The products query is required; the formulas query is
        // optional - if the formulas table doesn't exist we still return the catalog.
        const [productsRows] = await connection.execute(queryProducts);
        let formulasRows: unknown[] = [];
        try {
            const [rows] = await connection.execute(queryFormulas);
            formulasRows = rows as unknown[];
        } catch (formulaError) {
            console.warn('Could not load formulas, continuing without them:', formulaError);
        }

        // Currency columns follow the fixed product fields. Only Euro is supported for now.
        const currencies = ['Euro (€)'];

        // Process products
        const products = (productsRows as ArticleRow[]).map((row) => {
            const rate = row.rate != null ? Number(row.rate) / 100 : null;
            const price = Number((Number(row.amount) || 0).toFixed(2));
            return {
                rate: rate !== null && Number.isFinite(rate) ? rate : null,
                category: String(row.category),
                label: String(row.label),
                stock: row.stock != null ? Number(row.stock) : null,
                reference: row.reference != null ? String(row.reference) : null,
                photo: String(row.photo),
                description: String(row.description),
                color: String(row.color ?? ''),
                prices: [Number.isFinite(price) ? price : 0],
                options: row.options || null,
                sortOrder: Number(row.sort_order) || 0,
            };
        });

        // Process formulas - group by formula_id and reconstruct elements
        const formulaMap = new Map<number, FormulaData>();
        for (const row of formulasRows as FormulaRow[]) {
            const formulaId = row.formula_id;
            if (!formulaMap.has(formulaId)) {
                formulaMap.set(formulaId, {
                    label: row.label,
                    amount: row.amount,
                    rate: row.rate,
                    category: row.category,
                    color: String(row.color ?? ''),
                    elements: new Map<number, FormulaElement>(),
                });
            }
            const formula = formulaMap.get(formulaId);
            if (!formula) continue;

            if (row.element_id) {
                if (!formula.elements.has(row.element_id)) {
                    formula.elements.set(row.element_id, {
                        name: row.element_name || '',
                        category: row.element_category,
                        products: [],
                    });
                }
                const element = formula.elements.get(row.element_id);
                if (element && row.product_name) {
                    element.products.push(row.product_name);
                }
            }
        }

        // Convert formulas to product format with options JSON
        const formulaProducts = Array.from(formulaMap.values()).map((formula: FormulaData) => {
            const elements = Array.from(formula.elements.values()).map((el: FormulaElement) => ({
                name: el.name,
                category: el.category,
                products: el.products,
            }));
            const rate = formula.rate != null ? Number(formula.rate) / 100 : null;
            const price = Number((Number(formula.amount) || 0).toFixed(2));

            return {
                rate: rate !== null && Number.isFinite(rate) ? rate : null,
                category: String(formula.category),
                label: String(formula.label),
                stock: null,
                reference: '',
                photo: '',
                description: '',
                color: String(formula.color ?? ''),
                prices: [Number.isFinite(price) ? price : 0],
                options: JSON.stringify({ formula: true, elements, originalName: formula.label }),
                sortOrder: 0,
            };
        });

        // Combine products and formulas
        const allProducts = [...products, ...formulaProducts];

        return NextResponse.json({ products: allProducts, currencies }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
