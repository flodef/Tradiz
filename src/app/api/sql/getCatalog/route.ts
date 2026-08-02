import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb, DbConnection } from '../db';

interface ArticleRow {
    id: number;
    nom: string;
    prix: number;
    categorie: string;
    options: string | null;
}

interface FormulaRow {
    fid: number;
    fnom: string;
    fprix: number;
    fordre: number;
    eid: number;
    enom: string;
    ecategory: string | null;
    eordre: number;
    aid: number;
    anom: string;
    aprix: number;
    aoptions: string | null;
    aordre: number;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getMainDb(shopId);

        const isPg = connection.isPostgreSQL;

        // Articles with their options definition and category
        const queryArticles = isPg
            ? `SELECT id, name AS nom, price AS prix, category AS categorie, options FROM dc.products ORDER BY category, name`
            : `SELECT id, name AS nom, price AS prix, category AS categorie, options FROM products ORDER BY category, name`;
        const [articleRows] = await connection.execute(queryArticles);

        // Formula structure: one flat row per formula × element × article
        const queryFormulas = isPg
            ? `SELECT
                   f.id AS fid, f.name AS fnom, f.price AS fprix, f.sort_order AS fordre,
                   fe.id AS eid, fe.name AS enom, fe.category AS ecategory, ref.sort_order AS eordre,
                   p.id AS aid, p.name AS anom, p.price AS aprix, p.options AS aoptions,
                   rep.sort_order AS aordre
               FROM dc.formulas f
               JOIN dc.rel_formula_element_formula ref ON ref.formula_id = f.id
               JOIN dc.formula_elements fe ON fe.id = ref.formula_element_id
               JOIN dc.rel_formula_element_product rep ON rep.formula_element_id = fe.id
               JOIN dc.products p ON p.id = rep.product_id
               ORDER BY f.sort_order, ref.sort_order, rep.sort_order`
            : `SELECT
                   f.id AS fid, f.name AS fnom, f.price AS fprix, f.sort_order AS fordre,
                   fe.id AS eid, fe.name AS enom, fe.category AS ecategory, ref.sort_order AS eordre,
                   p.id AS aid, p.name AS anom, p.price AS aprix, p.options AS aoptions,
                   rep.sort_order AS aordre
               FROM formulas f
               JOIN rel_formula_element_formula ref ON ref.formula_id = f.id
               JOIN formula_elements fe ON fe.id = ref.formula_element_id
               JOIN rel_formula_element_product rep ON rep.formula_element_id = fe.id
               JOIN products p ON p.id = rep.product_id
               ORDER BY f.sort_order, ref.sort_order, rep.sort_order`;
        const [formulaRows] = await connection.execute(queryFormulas);

        // Build formula map preserving element order
        type ElemMap = Map<string, { id: string; nom: string; category: string; articles: object[] }>;
        const formulaMap = new Map<string, { id: string; nom: string; prix: number; elementMap: ElemMap }>();

        for (const row of formulaRows as FormulaRow[]) {
            const fKey = String(row.fid);
            if (!formulaMap.has(fKey)) {
                formulaMap.set(fKey, {
                    id: fKey,
                    nom: String(row.fnom),
                    prix: Number(row.fprix),
                    elementMap: new Map(),
                });
            }
            const f = formulaMap.get(fKey)!;
            const eKey = String(row.eid);
            if (!f.elementMap.has(eKey)) {
                f.elementMap.set(eKey, {
                    id: eKey,
                    nom: String(row.enom),
                    category: row.ecategory ?? '',
                    articles: [],
                });
            }
            f.elementMap.get(eKey)!.articles.push({
                id: Number(row.aid),
                nom: String(row.anom),
                prix: Number(row.aprix),
                options: row.aoptions || null,
            });
        }

        return NextResponse.json(
            {
                articles: (articleRows as ArticleRow[]).map((a) => ({
                    id: Number(a.id),
                    nom: String(a.nom),
                    prix: Number(a.prix),
                    categorie: String(a.categorie),
                    options: a.options || null,
                })),
                formulas: Array.from(formulaMap.values()).map((f) => ({
                    id: f.id,
                    nom: f.nom,
                    prix: f.prix,
                    elements: Array.from(f.elementMap.values()),
                })),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('getCatalog error:', error);
        return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
