import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

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
    panier_id: string;
    short_num_order: string | null;
    created_at: string;
    payment_method: string;
    status: string;
    amount: number;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate'); // Format: YYYY-MM-DD
    const endDate = searchParams.get('endDate'); // Format: YYYY-MM-DD

    try {
        const connection = await getPosDb();
        const mainDb = process.env.DB_NAME || 'DC';

        // Non-paid payment methods
        const nonPaidMethods = ['EFFACÉE', 'REMBOURSEMENT', 'EN COURS', 'EN ATTENTE'];
        const nonPaidCondition = nonPaidMethods.map(() => 'pm.label != ?').join(' AND ');

        let dateFilter = '';
        const params: string[] = [...nonPaidMethods];

        if (startDate && endDate) {
            dateFilter = 'AND DATE(f.created_at) BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        // 1. Daily revenue (Chiffre d'affaires par jour)
        const dailySalesQuery = `
            SELECT 
                DATE(f.created_at) as date,
                SUM(f.amount) as revenue
            FROM facturation f
            LEFT JOIN payment_methods pm ON pm.id = f.payment_method_id
            WHERE ${nonPaidCondition} ${dateFilter}
            GROUP BY DATE(f.created_at)
            ORDER BY date ASC
        `;
        const [dailySalesRows] = await connection.execute(dailySalesQuery, params);
        const dailySales = (dailySalesRows as DailySalesRow[]).map(row => ({
            date: row.date,
            revenue: Number(row.revenue) || 0,
        }));

        // 2. Top 10 products (Top 10 produits vendus)
        const topProductsQuery = `
            SELECT 
                fa.label,
                fa.category,
                SUM(fa.quantity) as quantity
            FROM facturation_article fa
            JOIN facturation f ON f.id = fa.facturation_id
            LEFT JOIN payment_methods pm ON pm.id = f.payment_method_id
            WHERE ${nonPaidCondition} ${dateFilter}
            GROUP BY fa.label, fa.category
            ORDER BY quantity DESC
            LIMIT 10
        `;
        const [topProductsRows] = await connection.execute(topProductsQuery, params);
        const topProducts = (topProductsRows as TopProductRow[]).map(row => ({
            label: row.label,
            category: row.category,
            quantity: Number(row.quantity) || 0,
        }));

        // 3. Average basket (Panier moyen)
        const avgBasketQuery = `
            SELECT AVG(f.amount) as avgBasket
            FROM facturation f
            LEFT JOIN payment_methods pm ON pm.id = f.payment_method_id
            WHERE ${nonPaidCondition} ${dateFilter}
        `;
        const [avgBasketRows] = await connection.execute(avgBasketQuery, params);
        const avgBasket = Number((avgBasketRows as any[])[0]?.avgBasket) || 0;

        // 4. Sales by category (Ventes par catégorie)
        const categorySalesQuery = `
            SELECT 
                fa.category,
                COUNT(*) as count
            FROM facturation_article fa
            JOIN facturation f ON f.id = fa.facturation_id
            LEFT JOIN payment_methods pm ON pm.id = f.payment_method_id
            WHERE ${nonPaidCondition} ${dateFilter}
            GROUP BY fa.category
            ORDER BY count DESC
        `;
        const [categorySalesRows] = await connection.execute(categorySalesQuery, params);
        const categorySales = (categorySalesRows as CategorySalesRow[]).map(row => ({
            category: row.category || 'Non catégorisé',
            count: Number(row.count) || 0,
        }));

        // 5. Total orders count (Nombre de commandes)
        const ordersCountQuery = `
            SELECT COUNT(*) as totalOrders
            FROM facturation f
            LEFT JOIN payment_methods pm ON pm.id = f.payment_method_id
            WHERE ${nonPaidCondition} ${dateFilter}
        `;
        const [ordersCountRows] = await connection.execute(ordersCountQuery, params);
        const totalOrders = Number((ordersCountRows as any[])[0]?.totalOrders) || 0;

        // 6. Recent orders (Dernières commandes)
        const recentOrdersQuery = `
            SELECT 
                f.panier_id,
                p.short_num_order,
                f.created_at,
                pm.label as payment_method,
                CASE 
                    WHEN pm.label IN ('EFFACÉE', 'REMBOURSEMENT', 'EN COURS', 'EN ATTENTE') THEN 'Non payé'
                    ELSE 'Payé'
                END as status,
                f.amount
            FROM facturation f
            LEFT JOIN payment_methods pm ON pm.id = f.payment_method_id
            LEFT JOIN \`${mainDb}\`.panier p ON p.id = f.panier_id
            WHERE 1=1 ${dateFilter}
            ORDER BY f.created_at DESC
            LIMIT 20
        `;
        const recentParams = startDate && endDate ? [startDate, endDate] : [];
        const [recentOrdersRows] = await connection.execute(recentOrdersQuery, recentParams);
        const recentOrders = (recentOrdersRows as RecentOrderRow[]).map(row => ({
            orderId: row.panier_id,
            shortOrderNumber: row.short_num_order || '-',
            date: row.created_at,
            paymentMethod: row.payment_method || 'Inconnu',
            status: row.status,
            amount: Number(row.amount) || 0,
        }));

        await connection.end();

        return NextResponse.json({
            dailySales,
            topProducts,
            avgBasket: Number(avgBasket.toFixed(2)),
            categorySales,
            totalOrders,
            recentOrders,
        }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching statistics' }, { status: 500 });
    }
}
