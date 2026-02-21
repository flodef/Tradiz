import { NextResponse } from 'next/server';
import { Product, EmptyDiscount } from '@/app/utils/interfaces';
import { getMainDb } from '../db';

// Helper: compute extra price from selected options against option definitions
const computeOptionsExtra = (selectedOptionsRaw: string | null, allOptionsRaw: string | null): { extra: number; desc: string[] } => {
    if (!selectedOptionsRaw || !allOptionsRaw) return { extra: 0, desc: [] };
    try {
        const sel: { type: string; valeur: string }[] = JSON.parse(selectedOptionsRaw);
        const def: { type: string; options: { valeur: string; prix: number | string }[] }[] = JSON.parse(allOptionsRaw);
        let extra = 0;
        const desc: string[] = [];
        for (const s of sel) {
            const defType = def.find((d) => d.type === s.type);
            const defOpt = defType?.options.find((o) => o.valeur === s.valeur);
            const prix = defOpt ? parseFloat(String(defOpt.prix)) || 0 : 0;
            extra += prix;
            desc.push(prix > 0 ? `${s.valeur} (+${prix.toFixed(2)}€)` : s.valeur);
        }
        return { extra, desc };
    } catch {
        return { extra: 0, desc: [] };
    }
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

    try {
        const connection = await getMainDb();

        // Query 1: Get articles
        const queryArticles = `
            SELECT a.nom AS label, a.prix as amount, b.quantite as quantity, c.nom AS category,
                   b.option AS selected_options, a.options AS all_options
            FROM article a
            JOIN rel_panier_article b ON b.article_id = a.id
            JOIN categorie c ON c.id = a.categorie
            WHERE b.panier_id = ?
        `;

        // Query 2: Get formule instances with their elements
        const queryFormules = `
            SELECT rpf.id AS rpf_id, f.nom AS label, f.prix AS amount, rpf.quantite AS quantity,
                   rpf.note
            FROM rel_panier_formule rpf
            JOIN formule f ON f.id = rpf.formule_id
            WHERE rpf.panier_id = ?
        `;

        // Query 3: Get elements for each formule instance
        const queryFormuleElements = `
            SELECT rpf_ef.id_pf, ef.nom AS nom_ef, a.nom AS nom_article,
                   rpf_ef.nom_categorie, rpf_ef.options AS selected_options, a.options AS all_options
            FROM rel_pf_ef rpf_ef
            JOIN element_formule ef ON ef.id = rpf_ef.id_ef
            JOIN article a ON a.id = rpf_ef.id_article
            WHERE rpf_ef.id_pf = ?
            ORDER BY rpf_ef.id
        `;

        // Execute article + formule queries
        const [articlesRows] = await connection.execute(queryArticles, [orderId]);
        const [formulesRows] = await connection.execute(queryFormules, [orderId]);

        // For each formule instance, fetch its elements
        const formulesWithDetails = await Promise.all(
            (formulesRows as any[]).map(async (formule) => {
                const [elementRows] = await connection.execute(queryFormuleElements, [formule.rpf_id]);
                return { ...formule, elements: elementRows as any[] };
            })
        );

        // Fetch short_num_order
        const [panierRow] = await connection.execute(`SELECT short_num_order FROM panier WHERE id = ?`, [orderId]);
        const shortNumOrder: string = (panierRow as any[])[0]?.short_num_order ?? '';

        await connection.end();

        // Build products for articles
        const articleProducts: Product[] = (articlesRows as any[]).map((row) => {
            let baseAmount = Number(Number(row.amount).toFixed(2));
            let selectedOptions: { type: string; valeur: string; prix: number }[] | undefined;

            if (row.selected_options && row.all_options) {
                try {
                    const optionsSel: { type: string; valeur: string }[] = JSON.parse(row.selected_options);
                    const optionsDef: { type: string; options: { valeur: string; prix: number | string }[] }[] = JSON.parse(row.all_options);
                    selectedOptions = optionsSel.map((sel) => {
                        let prix = 0;
                        const defType = optionsDef.find((d) => d.type === sel.type);
                        if (defType) {
                            const defOpt = defType.options.find((o) => o.valeur === sel.valeur);
                            if (defOpt) prix = parseFloat(String(defOpt.prix)) || 0;
                        }
                        baseAmount += prix;
                        return { type: sel.type, valeur: sel.valeur, prix };
                    });
                } catch { /* ignore */ }
            }

            return {
                label: String(row.label),
                category: String(row.category),
                quantity: Number(row.quantity),
                amount: baseAmount,
                discount: EmptyDiscount,
                ...(selectedOptions && selectedOptions.length > 0 ? { options: JSON.stringify(selectedOptions) } : {}),
            };
        });

        // Build products for formules
        const formuleProducts: Product[] = formulesWithDetails.map((formule) => {
            let baseAmount = Number(Number(formule.amount).toFixed(2));

            // Build element entries: accumulate paid option extras, encode each element as an "element" option
            const elementOptions: { type: string; valeur: string; prix: number }[] = [];
            for (const el of formule.elements) {
                const { extra, desc } = computeOptionsExtra(el.selected_options, el.all_options);
                baseAmount += extra;
                const optStr = desc.length > 0 ? ` [${desc.join(', ')}]` : '';
                elementOptions.push({ type: 'element', valeur: `${el.nom_article}${optStr}`, prix: 0 });
            }

            // Add note as a special element if present
            if (formule.note) {
                elementOptions.push({ type: 'element', valeur: `Note : ${formule.note}`, prix: 0 });
            }

            return {
                label: String(formule.label),
                category: 'Formule',
                quantity: Number(formule.quantity),
                amount: baseAmount,
                discount: EmptyDiscount,
                ...(elementOptions.length > 0 ? { options: JSON.stringify(elementOptions) } : {}),
            };
        });

        const products: Product[] = [...articleProducts, ...formuleProducts];

        return NextResponse.json({ shortNumOrder, products }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
