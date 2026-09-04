import { getShopIdFromRequest } from '@/app/constants/shop';
import {
    CANCELLED_KEYWORD,
    DELETED_KEYWORD,
    HARD_DELETED_KEYWORD,
    PROCESSING_KEYWORD,
    REFUND_KEYWORD,
    UPDATING_KEYWORD,
    WAITING_KEYWORD,
} from '@/app/utils/constants';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

// Payment methods that do not represent a completed payment and must be excluded
// from revenue, basket, product and order-count statistics.
const NON_PAID_METHODS = [
    DELETED_KEYWORD,
    CANCELLED_KEYWORD,
    HARD_DELETED_KEYWORD,
    REFUND_KEYWORD,
    UPDATING_KEYWORD,
    PROCESSING_KEYWORD,
    WAITING_KEYWORD,
];

interface DailySalesRow {
    date: string;
    revenue: number;
}

interface TopProductRow {
    label: string;
    category: string;
    quantity: number;
}

interface CategorySalesRow {
    category: string;
    count: number;
}

interface RecentOrderRow {
    order_id: string;
    short_num_order: string | null;
    created_at: string;
    payment_method: string;
    status: string;
    amount: number;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate'); // Format: YYYY-MM-DD
    const endDate = searchParams.get('endDate'); // Format: YYYY-MM-DD

    let dbConn: DbConnection | undefined;
    try {
        const connection = await getPosDb(shopId);
        dbConn = connection;

        const isPg = connection.isPostgreSQL;
        const nonPaidCondition = NON_PAID_METHODS.map((_, i) =>
            isPg ? `t.payment_method != $${i + 1}` : 't.payment_method != ?'
        ).join(' AND ');

        let dateFilter = '';
        // Separate filter for the recent-orders query, which doesn't bind nonPaidMethods params.
        let recentDateFilter = '';
        const params: string[] = [...NON_PAID_METHODS];

        if (startDate && endDate) {
            if (isPg) {
                dateFilter = `AND DATE(t.created_at) BETWEEN $${NON_PAID_METHODS.length + 1} AND $${NON_PAID_METHODS.length + 2}`;
                recentDateFilter = 'AND DATE(t.created_at) BETWEEN $1 AND $2';
            } else {
                dateFilter = 'AND DATE(t.created_at) BETWEEN ? AND ?';
                recentDateFilter = 'AND DATE(t.created_at) BETWEEN ? AND ?';
            }
            params.push(startDate, endDate);
        }

        // 1. Daily revenue (Chiffre d'affaires par jour)
        const dailySalesQuery = connection.isPostgreSQL
            ? `
            SELECT
                DATE(t.created_at) as date,
                SUM(t.amount) as revenue
            FROM dc_pos.transactions t
            WHERE ${nonPaidCondition} ${dateFilter}
            GROUP BY DATE(t.created_at)
            ORDER BY date ASC
        `
            : `
            SELECT
                DATE(t.created_at) as date,
                SUM(t.amount) as revenue
            FROM transactions t
            WHERE ${nonPaidCondition} ${dateFilter}
            GROUP BY DATE(t.created_at)
            ORDER BY date ASC
        `;
        const [dailySalesRows] = await connection.execute(dailySalesQuery, params);
        const dailySales = (dailySalesRows as DailySalesRow[]).map((row) => ({
            date: row.date,
            revenue: Number(row.revenue) || 0,
        }));

        // 2. Top 10 products (Top 10 produits vendus)
        const topProductsQuery = connection.isPostgreSQL
            ? `
            SELECT
                ti.label,
                ti.category,
                SUM(ti.quantity) as quantity
            FROM dc_pos.transaction_items ti
            JOIN dc_pos.transactions t ON t.id = ti.transaction_id
            WHERE ${nonPaidCondition} ${dateFilter}
            GROUP BY ti.label, ti.category
            ORDER BY quantity DESC
            LIMIT 10
        `
            : `
            SELECT
                ti.label,
                ti.category,
                SUM(ti.quantity) as quantity
            FROM transaction_items ti
            JOIN transactions t ON t.id = ti.transaction_id
            WHERE ${nonPaidCondition} ${dateFilter}
            GROUP BY ti.label, ti.category
            ORDER BY quantity DESC
            LIMIT 10
        `;
        const [topProductsRows] = await connection.execute(topProductsQuery, params);
        const topProducts = (topProductsRows as TopProductRow[]).map((row) => ({
            label: row.label,
            category: row.category,
            quantity: Number(row.quantity) || 0,
        }));

        // 3. Average basket (Panier moyen)
        const avgBasketQuery = connection.isPostgreSQL
            ? `
            SELECT AVG(t.amount) as avgBasket
            FROM dc_pos.transactions t
            WHERE ${nonPaidCondition} ${dateFilter}
        `
            : `
            SELECT AVG(t.amount) as avgBasket
            FROM transactions t
            WHERE ${nonPaidCondition} ${dateFilter}
        `;
        const [avgBasketRows] = await connection.execute(avgBasketQuery, params);
        const avgBasket = Number((avgBasketRows as { avgBasket: number }[])[0]?.avgBasket) || 0;

        // 4. Sales by category (Ventes par catégorie)
        const categorySalesQuery = connection.isPostgreSQL
            ? `
            SELECT
                ti.category,
                COUNT(*) as count
            FROM dc_pos.transaction_items ti
            JOIN dc_pos.transactions t ON t.id = ti.transaction_id
            WHERE ${nonPaidCondition} ${dateFilter}
            GROUP BY ti.category
            ORDER BY count DESC
        `
            : `
            SELECT
                ti.category,
                COUNT(*) as count
            FROM transaction_items ti
            JOIN transactions t ON t.id = ti.transaction_id
            WHERE ${nonPaidCondition} ${dateFilter}
            GROUP BY ti.category
            ORDER BY count DESC
        `;
        const [categorySalesRows] = await connection.execute(categorySalesQuery, params);
        const categorySales = (categorySalesRows as CategorySalesRow[]).map((row) => ({
            category: row.category || 'Non catégorisé',
            count: Number(row.count) || 0,
        }));

        // 5. Total orders count (Nombre de commandes)
        const ordersCountQuery = connection.isPostgreSQL
            ? `
            SELECT COUNT(*) as totalOrders
            FROM dc_pos.transactions t
            WHERE ${nonPaidCondition} ${dateFilter}
        `
            : `
            SELECT COUNT(*) as totalOrders
            FROM transactions t
            WHERE ${nonPaidCondition} ${dateFilter}
        `;
        const [ordersCountRows] = await connection.execute(ordersCountQuery, params);
        const totalOrders = Number((ordersCountRows as { totalOrders: number }[])[0]?.totalOrders) || 0;

        // 6. Recent orders (Dernières commandes)
        const recentOrdersQuery = connection.isPostgreSQL
            ? `
            SELECT
                t.order_id,
                o.short_order_number AS short_num_order,
                t.created_at,
                t.payment_method,
                CASE
                    WHEN t.payment_method IN ('${NON_PAID_METHODS.join("', '")}') THEN 'Non payé'
                    ELSE 'Payé'
                END as status,
                t.amount
            FROM dc_pos.transactions t
            LEFT JOIN dc.orders o ON o.id::text = t.order_id
            WHERE 1=1 ${recentDateFilter}
            ORDER BY t.created_at DESC
            LIMIT 20
        `
            : `
            SELECT 
                t.order_id,
                o.short_order_number AS short_num_order,
                t.created_at,
                t.payment_method,
                CASE
                    WHEN t.payment_method IN ('${NON_PAID_METHODS.join("', '")}') THEN 'Non payé'
                    ELSE 'Payé'
                END as status,
                t.amount
            FROM transactions t
            LEFT JOIN \`DC\`.orders o ON o.id = t.order_id
            WHERE 1=1 ${recentDateFilter}
            ORDER BY t.created_at DESC
            LIMIT 20
        `;
        const recentParams = startDate && endDate ? [startDate, endDate] : [];
        const [recentOrdersRows] = await connection.execute(recentOrdersQuery, recentParams);
        const recentOrders = (recentOrdersRows as RecentOrderRow[]).map((row) => ({
            orderId: row.order_id,
            shortOrderNumber: row.short_num_order || '-',
            timestamp: row.created_at ? new Date(row.created_at).getTime() : 0,
            paymentMethod: row.payment_method || 'Inconnu',
            status: row.status,
            amount: Number(row.amount) || 0,
        }));

        await connection.end();

        return NextResponse.json(
            {
                dailySales,
                topProducts,
                avgBasket: Number(avgBasket.toFixed(2)),
                categorySales,
                totalOrders,
                recentOrders,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching statistics' }, { status: 500 });
    } finally {
        await dbConn?.end();
    }
}
