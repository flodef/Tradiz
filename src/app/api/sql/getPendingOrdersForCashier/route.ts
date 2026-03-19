import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getMainDb } from '../db';

interface PendingOrderRow extends RowDataPacket {
    order_id: number;
    short_num_order: string | null;
    created_at: string;
    table_id: number | null;
}

export async function GET() {
    let connection;
    try {
        connection = await getMainDb();

        const query = `
            SELECT
                p.id AS order_id,
                p.short_num_order,
                p.date AS created_at,
                MIN(rtp.table_id) AS table_id
            FROM panier p
            LEFT JOIN rel_table_panier rtp ON rtp.panier_id = p.id
            WHERE p.paid = 0
            GROUP BY p.id, p.short_num_order, p.date
            ORDER BY p.date ASC, p.id ASC
        `;

        const [rows] = await connection.execute(query);

        const pendingOrders = (rows as PendingOrderRow[]).map((row) => ({
            orderId: Number(row.order_id),
            shortNumOrder: row.short_num_order ?? '',
            tableId: row.table_id !== null ? Number(row.table_id) : null,
            createdAt: String(row.created_at),
        }));

        return NextResponse.json(pendingOrders);
    } catch (error) {
        console.error('Error fetching pending orders for cashier:', error);
        return NextResponse.json({ error: 'Database error', details: String(error) }, { status: 500 });
    } finally {
        if (connection) await connection.end();
    }
}
