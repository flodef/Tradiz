import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextRequest, NextResponse } from 'next/server';
import { Connection, getMainDb } from '../db';

interface CountRow {
    unpaid_count: number;
}

interface PaymentItem {
    id: string;
    type: 'article' | 'formule';
}

export async function POST(request: NextRequest) {
    const shopId = getShopIdFromRequest(request);
    let connection: Connection | undefined;
    try {
        const body = await request.json();
        const { orderId, paidItems } = body as {
            orderId: string;
            paidItems: PaymentItem[];
            paymentMethod: string;
        };

        if (!orderId || !paidItems || !Array.isArray(paidItems)) {
            return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
        }

        connection = await getMainDb(shopId);
        await connection.beginTransaction();

        const now = new Date();
        const formattedDate = now.toISOString().slice(0, 19).replace('T', ' ');

        // Update paid_at for each item
        for (const item of paidItems) {
            if (item.type === 'article') {
                const query = connection.isPostgreSQL
                    ? 'UPDATE rel_panier_article SET paid_at = $1 WHERE id = $2'
                    : 'UPDATE rel_panier_article SET paid_at = ? WHERE id = ?';
                await connection.execute(query, [formattedDate, item.id]);
            } else if (item.type === 'formule') {
                const query = connection.isPostgreSQL
                    ? 'UPDATE rel_panier_formule SET paid_at = $1 WHERE id = $2'
                    : 'UPDATE rel_panier_formule SET paid_at = ? WHERE id = ?';
                await connection.execute(query, [formattedDate, item.id]);
            }
        }

        // Check if all items are now paid
        const articleCheckQuery = connection.isPostgreSQL
            ? 'SELECT COUNT(*) as unpaid_count FROM rel_panier_article WHERE panier_id = $1 AND paid_at IS NULL'
            : 'SELECT COUNT(*) as unpaid_count FROM rel_panier_article WHERE panier_id = ? AND paid_at IS NULL';
        const [articleCheckRows] = await connection.execute(articleCheckQuery, [orderId]);

        const formuleCheckQuery = connection.isPostgreSQL
            ? 'SELECT COUNT(*) as unpaid_count FROM rel_panier_formule WHERE panier_id = $1 AND paid_at IS NULL'
            : 'SELECT COUNT(*) as unpaid_count FROM rel_panier_formule WHERE panier_id = ? AND paid_at IS NULL';
        const [formuleCheckRows] = await connection.execute(formuleCheckQuery, [orderId]);

        const articlesUnpaid = (articleCheckRows as CountRow[])[0]?.unpaid_count || 0;
        const formulesUnpaid = (formuleCheckRows as CountRow[])[0]?.unpaid_count || 0;
        const allPaid = articlesUnpaid === 0 && formulesUnpaid === 0;

        // If all items are paid, transition to kitchen_view = 1
        if (allPaid) {
            // Update articles to kitchen_view = 1 (En préparation)
            const updateArticlesQuery = connection.isPostgreSQL
                ? 'UPDATE rel_panier_article SET kitchen_view = 1 WHERE panier_id = $1 AND kitchen_view = 0'
                : 'UPDATE rel_panier_article SET kitchen_view = 1 WHERE panier_id = ? AND kitchen_view = 0';
            await connection.execute(updateArticlesQuery, [orderId]);

            // Update formule elements to kitchen_view = 1
            const updateFormuleQuery = connection.isPostgreSQL
                ? `
                UPDATE rel_pf_ef
                 SET kitchen_view = 1
                 WHERE id_pf IN (
                     SELECT id FROM rel_panier_formule WHERE panier_id = $1
                 ) AND kitchen_view = 0
            `
                : `
                UPDATE rel_pf_ef
                 SET kitchen_view = 1
                 WHERE id_pf IN (
                     SELECT id FROM rel_panier_formule WHERE panier_id = ?
                 ) AND kitchen_view = 0
            `;
            await connection.execute(updateFormuleQuery, [orderId]);

            // Update panier to mark as paid and set preparation_started_at
            const updatePanierQuery = connection.isPostgreSQL
                ? 'UPDATE panier SET paid = 1, preparation_started_at = $1 WHERE id = $2'
                : 'UPDATE panier SET paid = 1, preparation_started_at = ? WHERE id = ?';
            await connection.execute(updatePanierQuery, [formattedDate, orderId]);
        }

        await connection.commit();

        return NextResponse.json({
            success: true,
            allPaid,
            message: allPaid ? 'Commande entièrement payée - envoyée en préparation' : 'Paiement partiel enregistré',
        });
    } catch (error) {
        console.error('Error saving partial payment:', error);
        if (connection) await connection.rollback();
        return NextResponse.json({ error: 'Database error', details: String(error) }, { status: 500 });
    } finally {
        if (connection) await connection.end();
    }
}
