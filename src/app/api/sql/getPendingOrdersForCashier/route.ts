import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getMainDb } from '../db';

interface PendingOrderRow extends RowDataPacket {
    order_id: number;
    short_num_order: string | null;
    created_at: string;
    table_id: number | null;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    const tableIdParam = new URL(request.url).searchParams.get('tableId');
    let connection;
    try {
        connection = await getMainDb(shopId);

        const parsedTableId = Number(tableIdParam);
        const hasTableFilter = Number.isFinite(parsedTableId) && parsedTableId > 0;

        const params: number[] = [];
        let query = connection.isPostgreSQL
            ? `
            SELECT
                o.id AS order_id,
                o.short_order_number AS short_num_order,
                o.created_at,
                MIN(rto.table_id) AS table_id
            FROM dc.orders o
            LEFT JOIN dc.rel_table_order rto ON rto.order_id = o.id
            WHERE o.paid = false
        `
            : `
            SELECT
                p.id AS order_id,
                p.short_order_number AS short_num_order,
                p.created_at,
                MIN(rtp.table_id) AS table_id
            FROM orders p
            LEFT JOIN rel_table_order rtp ON rtp.order_id = p.id
            WHERE p.paid = 0
        `;

        if (hasTableFilter) {
            if (connection.isPostgreSQL) {
                query += ' AND rto.table_id = $1';
            } else {
                query += ' AND rtp.table_id = ?';
            }
            params.push(parsedTableId);
        }

        const groupCol = connection.isPostgreSQL ? 'o' : 'p';
        query += `
            GROUP BY ${groupCol}.id, ${groupCol}.short_order_number, ${groupCol}.created_at
            ORDER BY ${groupCol}.created_at ASC, ${groupCol}.id ASC
        `;

        const [rows] = await connection.execute(query, params);

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
