import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

// Database connection configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'DC',
};

interface PaymentItem {
    id: string;
    type: 'article' | 'formule';
}

export async function POST(request: NextRequest) {
    let connection;
    try {
        const body = await request.json();
        const { orderId, paidItems, paymentMethod } = body as {
            orderId: string;
            paidItems: PaymentItem[];
            paymentMethod: string;
        };

        if (!orderId || !paidItems || !Array.isArray(paidItems)) {
            return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        const now = new Date();
        const formattedDate = now.toISOString().slice(0, 19).replace('T', ' ');

        // Update paid_at for each item
        for (const item of paidItems) {
            if (item.type === 'article') {
                await connection.execute(
                    `UPDATE rel_panier_article SET paid_at = ? WHERE id = ?`,
                    [formattedDate, item.id]
                );
            } else if (item.type === 'formule') {
                await connection.execute(
                    `UPDATE rel_panier_formule SET paid_at = ? WHERE id = ?`,
                    [formattedDate, item.id]
                );
            }
        }

        // Check if all items are now paid
        const [articleCheck] = await connection.execute(
            `SELECT COUNT(*) as unpaid_count FROM rel_panier_article WHERE panier_id = ? AND paid_at IS NULL`,
            [orderId]
        );
        const [formuleCheck] = await connection.execute(
            `SELECT COUNT(*) as unpaid_count FROM rel_panier_formule WHERE panier_id = ? AND paid_at IS NULL`,
            [orderId]
        );

        const articlesUnpaid = (articleCheck as any[])[0].unpaid_count;
        const formulesUnpaid = (formuleCheck as any[])[0].unpaid_count;
        const allPaid = articlesUnpaid === 0 && formulesUnpaid === 0;

        // If all items are paid, transition to kitchen_view = 1
        if (allPaid) {
            // Update articles to kitchen_view = 1 (En préparation)
            await connection.execute(
                `UPDATE rel_panier_article SET kitchen_view = 1 WHERE panier_id = ? AND kitchen_view = 0`,
                [orderId]
            );

            // Update formule elements to kitchen_view = 1
            await connection.execute(
                `UPDATE rel_pf_ef 
                 SET kitchen_view = 1 
                 WHERE id_pf IN (
                     SELECT id FROM rel_panier_formule WHERE panier_id = ?
                 ) AND kitchen_view = 0`,
                [orderId]
            );

            // Update panier to mark as paid and set preparation_started_at
            await connection.execute(
                `UPDATE panier SET paid = 1, preparation_started_at = ? WHERE id = ?`,
                [formattedDate, orderId]
            );
        }

        await connection.commit();
        await connection.end();

        return NextResponse.json({
            success: true,
            allPaid,
            message: allPaid ? 'Commande entièrement payée - envoyée en préparation' : 'Paiement partiel enregistré',
        });
    } catch (error) {
        console.error('Error saving partial payment:', error);
        if (connection) {
            await connection.rollback();
            await connection.end();
        }
        return NextResponse.json({ error: 'Database error', details: String(error) }, { status: 500 });
    }
}
