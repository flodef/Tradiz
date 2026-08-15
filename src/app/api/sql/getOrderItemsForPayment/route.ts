import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextRequest, NextResponse } from 'next/server';
import { Connection, getMainDb } from '../db';
import { OrderData, OrderItem, dbToServiceType } from '@/app/utils/interfaces';

interface OrderRow {
    id: number;
    short_num_order: string;
    service_type: string;
}

interface ProductItemRow {
    id: string;
    product_id: number;
    label: string;
    quantity: number;
    price: string;
    category: string;
    options?: string;
    paid_at?: string | null;
    kitchen_view: number;
}

interface FormulaRow {
    id: number;
    label: string;
    quantity: number;
    price: string;
    note?: string;
    paid_at?: string | null;
}

interface FormulaElementRow {
    category: string;
    choice: string;
    options?: string;
}

export async function GET(request: NextRequest) {
    const shopId = getShopIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
        return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    let connection: Connection | undefined;
    try {
        connection = await getMainDb(shopId);

        // Get order info
        const orderQuery = connection.isPostgreSQL
            ? 'SELECT id, short_order_number AS short_num_order, service_type FROM dc.orders WHERE id = $1'
            : 'SELECT id, short_order_number AS short_num_order, service_type FROM orders WHERE id = ?';
        const [orderRows] = await connection.execute(orderQuery, [orderId]);

        if (!Array.isArray(orderRows) || orderRows.length === 0) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const order = (orderRows as OrderRow[])[0];
        const items: OrderItem[] = [];

        // Get products (non-formula items)
        const productQuery = connection.isPostgreSQL
            ? `
            SELECT
                rop.id,
                rop.product_id,
                p.name as label,
                rop.quantity,
                p.price,
                rop.category_name as category,
                rop.options,
                rop.paid_at,
                rop.kitchen_view
            FROM dc.rel_order_product rop
            JOIN dc.products p ON p.id = rop.product_id
            WHERE rop.order_id = $1
            ORDER BY rop.id
        `
            : `
            SELECT
                rop.id,
                rop.product_id,
                p.name as label,
                rop.quantity,
                p.price,
                rop.category_name as category,
                rop.options,
                rop.paid_at,
                rop.kitchen_view
            FROM rel_order_product rop
            JOIN products p ON p.id = rop.product_id
            WHERE rop.order_id = ?
            ORDER BY rop.id
        `;
        const [productRows] = await connection.execute(productQuery, [orderId]);

        for (const row of productRows as ProductItemRow[]) {
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

        // Get formulas
        const formulaQuery = connection.isPostgreSQL
            ? `
            SELECT
                rof.id,
                f.name as label,
                rof.quantity,
                f.price,
                rof.note,
                rof.paid_at
            FROM dc.rel_order_formula rof
            JOIN dc.formulas f ON f.id = rof.formula_id
            WHERE rof.order_id = $1
            ORDER BY rof.id
        `
            : `
            SELECT
                rof.id,
                f.name as label,
                rof.quantity,
                f.price,
                rof.note,
                rof.paid_at
            FROM rel_order_formula rof
            JOIN formulas f ON f.id = rof.formula_id
            WHERE rof.order_id = ?
            ORDER BY rof.id
        `;
        const [formulaRows] = await connection.execute(formulaQuery, [orderId]);

        for (const formula of formulaRows as FormulaRow[]) {
            // Get elements of this formula
            const elementQuery = connection.isPostgreSQL
                ? `
                SELECT
                    rofe.category_name as category,
                    p.name as choice,
                    rofe.options
                FROM dc.rel_order_formula_element rofe
                JOIN dc.products p ON p.id = rofe.product_id
                WHERE rofe.order_formula_id = $1
                ORDER BY rofe.id
            `
                : `
                SELECT
                    rofe.category_name as category,
                    p.name as choice,
                    rofe.options
                FROM rel_order_formula_element rofe
                JOIN products p ON p.id = rofe.product_id
                WHERE rofe.order_formula_id = ?
                ORDER BY rofe.id
            `;
            const [elementRows] = await connection.execute(elementQuery, [formula.id]);

            const elements = (elementRows as FormulaElementRow[]).map((el) => ({
                category: el.category,
                choice: el.choice,
                options: el.options,
            }));

            items.push({
                id: formula.id.toString(),
                type: 'formule',
                label: formula.label,
                quantity: formula.quantity,
                price: parseFloat(formula.price),
                note: formula.note,
                paid_at: formula.paid_at,
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
            order_id: order.id,
            short_num_order: order.short_num_order,
            service_type: dbToServiceType(order.service_type),
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
