import { DELETED_KEYWORD, POS } from '@/app/utils/constants';
import { Transaction } from '@/app/utils/interfaces';
import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // Format: YYYY-MM-DD
    const period = searchParams.get('period'); // 'day' or 'full'

    try {
        // Connection configuration for SQL DB
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME + '_' + POS,
        });

        let whereClause = '1=1';
        const params: string[] = [];

        // Filter by date if provided
        if (date && period === 'day') {
            whereClause += ' AND DATE(f.created_at) = ?';
            params.push(date);
        }

        // Query to get transactions with their products
        const query = `
            SELECT 
                f.id,
                f.panier_id,
                u.name as validator,
                pm.label as method,
                f.amount,
                f.currency,
                f.note,
                UNIX_TIMESTAMP(f.created_at) * 1000 as createdDate,
                UNIX_TIMESTAMP(f.updated_at) * 1000 as modifiedDate
            FROM facturation f
            LEFT JOIN users u ON u.id = f.user_id
            LEFT JOIN payment_methods pm ON pm.id = f.payment_method_id
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
            });
        }

        await connection.end();

        return NextResponse.json({ transactions }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching transactions' }, { status: 500 });
    }
}
