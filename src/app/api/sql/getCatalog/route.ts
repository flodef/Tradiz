import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

export async function GET() {
    try {
        const connection = await getMainDb();

        // Articles with their options definition and category
        const [articleRows] = await connection.execute(`
            SELECT a.id, a.nom, a.prix, c.nom AS categorie, a.options
            FROM article a
            JOIN categorie c ON c.id = a.categorie
            ORDER BY c.nom, a.nom
        `);

        // Formula structure: one flat row per formula × element × article
        const [formulaRows] = await connection.execute(`
            SELECT
                f.id AS fid, f.nom AS fnom, f.prix AS fprix, f.ordre AS fordre,
                ef.id AS eid, ef.nom AS enom, ref.ordre AS eordre,
                a.id AS aid, a.nom AS anom, a.prix AS aprix, a.options AS aoptions,
                rea.ordre AS aordre
            FROM formule f
            JOIN rel_ef_formule ref ON ref.id_formule = f.id
            JOIN element_formule ef ON ef.id = ref.id_element_formule
            JOIN rel_ef_article rea ON rea.id_element_formule = ef.id
            JOIN article a ON a.id = rea.id_article
            ORDER BY f.ordre, ref.ordre, rea.ordre
        `);

        await connection.end();

        // Build formula map preserving element order
        type ElemMap = Map<string, { id: string; nom: string; articles: object[] }>;
        const formulaMap = new Map<string, { id: string; nom: string; prix: number; elementMap: ElemMap }>();

        for (const row of formulaRows as any[]) {
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
                f.elementMap.set(eKey, { id: eKey, nom: String(row.enom), articles: [] });
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
                articles: (articleRows as any[]).map((a) => ({
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
    }
}
