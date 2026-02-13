import { NextRequest, NextResponse } from 'next/server';
import { Connection, getMainDb } from '../db';
import { OrderData, OrderItem } from '@/app/utils/interfaces';

interface PanierRow {
    id: number;
    short_num_order: string;
    service_type: 'emporter' | 'sur_place';
}

interface ArticleRow {
    id: string;
    article_id: number;
    label: string;
    quantity: number;
    price: string;
    category: string;
    options?: string;
    paid_at?: string | null;
    kitchen_view: number;
}

interface FormuleRow {
    id: number;
    label: string;
    quantity: number;
    price: string;
    note?: string;
    paid_at?: string | null;
}

interface FormuleElementRow {
    category: string;
    choice: string;
    options?: string;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
        return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    let connection: Connection | undefined;
    try {
        connection = await getMainDb();

        // Get panier info
        const [panierRows] = await connection.execute(
            `SELECT id, short_num_order, service_type FROM panier WHERE id = ?`,
            [orderId]
        );

        if (!Array.isArray(panierRows) || panierRows.length === 0) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const panier = (panierRows as PanierRow[])[0];
        const items: OrderItem[] = [];

        // Get articles (non-formule items)
        const [articleRows] = await connection.execute(
            `SELECT 
                rpa.id,
                rpa.article_id,
                a.nom as label,
                rpa.quantite as quantity,
                a.prix as price,
                rpa.nom_categorie as category,
                rpa.option as options,
                rpa.paid_at,
                rpa.kitchen_view
            FROM rel_panier_article rpa
            JOIN article a ON a.id = rpa.article_id
            WHERE rpa.panier_id = ?
            ORDER BY rpa.id`,
            [orderId]
        );

        for (const row of articleRows as ArticleRow[]) {
            items.push({
                id: row.id,
                type: 'article',
                label: row.label,
                quantity: row.quantity,
                price: parseFloat(row.price),
                category: row.category,
                options: row.options,
                paid_at: row.paid_at,
                kitchen_view: row.kitchen_view,
            });
        }

        // Get formules
        const [formuleRows] = await connection.execute(
            `SELECT 
                rpf.id,
                f.nom as label,
                rpf.quantite as quantity,
                f.prix as price,
                rpf.note,
                rpf.paid_at
            FROM rel_panier_formule rpf
            JOIN formule f ON f.id = rpf.formule_id
            WHERE rpf.panier_id = ?
            ORDER BY rpf.id`,
            [orderId]
        );

        for (const formule of formuleRows as FormuleRow[]) {
            // Get elements of this formule
            const [elementRows] = await connection.execute(
                `SELECT 
                    rpf_ef.nom_categorie as category,
                    a.nom as choice,
                    rpf_ef.options
                FROM rel_pf_ef rpf_ef
                JOIN article a ON a.id = rpf_ef.id_article
                WHERE rpf_ef.id_pf = ?
                ORDER BY rpf_ef.id`,
                [formule.id]
            );

            const elements = (elementRows as FormuleElementRow[]).map((el) => ({
                category: el.category,
                choice: el.choice,
                options: el.options,
            }));

            items.push({
                id: formule.id.toString(),
                type: 'formule',
                label: formule.label,
                quantity: formule.quantity,
                price: parseFloat(formule.price),
                note: formule.note,
                paid_at: formule.paid_at,
                elements,
            });
        }

        // Calculate totals
        const total_amount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const paid_amount = items
            .filter((item) => item.paid_at)
            .reduce((sum, item) => sum + item.price * item.quantity, 0);
        const remaining_amount = total_amount - paid_amount;

        const orderData: OrderData = {
            panier_id: panier.id,
            short_num_order: panier.short_num_order,
            service_type: panier.service_type,
            items,
            total_amount,
            paid_amount,
            remaining_amount,
        };

        return NextResponse.json(orderData);
    } catch (error) {
        console.error('Error fetching order items:', error);
        return NextResponse.json({ error: 'Database error', details: String(error) }, { status: 500 });
    } finally {
        if (connection) await connection.end();
    }
}
