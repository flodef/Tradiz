import { DELETED_KEYWORD } from '@/app/utils/constants';
import { Transaction } from '@/app/utils/interfaces';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // Format: YYYY-MM-DD
    const period = searchParams.get('period'); // 'day' or 'full'

    try {
        const connection = await getPosDb();

        let whereClause = '1=1';
        const params: string[] = [];

        // Filter by date if provided
        if (date && period === 'day') {
            whereClause += ' AND DATE(f.created_at) = ?';
            params.push(date);
        }

        // Query to get transactions with their products
        const mainDb = process.env.DB_NAME || 'DC';
        const query = `
            SELECT 
                f.id,
                f.panier_id,
                p.short_num_order,
                COALESCE(u.name, 'Comptoir') as validator,
                pm.label as method,
                f.amount,
                f.currency,
                f.note,
                UNIX_TIMESTAMP(f.created_at) * 1000 as createdDate,
                UNIX_TIMESTAMP(f.updated_at) * 1000 as modifiedDate
            FROM facturation f
            LEFT JOIN users u ON u.id = f.user_id
            LEFT JOIN payment_methods pm ON pm.id = f.payment_method_id
            LEFT JOIN \`${mainDb}\`.panier p ON p.id = f.panier_id
            WHERE ${whereClause}
            ORDER BY f.created_at DESC
        `;

        const [rows] = await connection.execute(query, params);

        // Get products for each transaction
        const transactions: Transaction[] = [];

        for (const row of rows as Record<string, unknown>[]) {
            // Skip deleted transactions
            if (row.method === DELETED_KEYWORD) continue;

            const [productRows] = await connection.execute(
                `SELECT label, category, amount, quantity, discount_amount, discount_unit, total
                 FROM facturation_article
                 WHERE facturation_id = ?`,
                [row.id]
            );

            const products = (productRows as Record<string, unknown>[]).map((p) => ({
                label: String(p.label || ''),
                category: String(p.category || ''),
                amount: Number(p.amount),
                quantity: Number(p.quantity),
                discount: {
                    amount: Number(p.discount_amount) || 0,
                    unit: String(p.discount_unit || '%'),
                },
                total: Number(p.total),
            }));

            transactions.push({
                validator: String(row.validator || ''),
                method: String(row.method || ''),
                amount: Number(row.amount),
                currency: String(row.currency || ''),
                createdDate: Number(row.createdDate),
                modifiedDate: Number(row.modifiedDate) || Number(row.createdDate),
                products,
                ...(row.short_num_order ? { shortNumOrder: String(row.short_num_order) } : {}),
            });
        }

        await connection.end();

        return NextResponse.json({ transactions }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching transactions' }, { status: 500 });
    }
}
