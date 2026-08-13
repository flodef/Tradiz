import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

interface PaymentMethod {
    type: string;
    id: string;
    currency: string;
    availability: boolean;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { paymentMethods } = (await request.json()) as { paymentMethods: PaymentMethod[] };

        if (!Array.isArray(paymentMethods)) {
            return NextResponse.json({ error: 'Invalid payment methods data' }, { status: 400 });
        }

        connection = await getPosDb(shopId);

        await connection.beginTransaction();
        try {
            // Delete all existing payment methods
            const deleteQuery = connection.isPostgreSQL
                ? 'DELETE FROM dc_pos.payment_methods'
                : 'DELETE FROM payment_methods';
            await connection.execute(deleteQuery);

            // Insert new payment methods
            for (const method of paymentMethods) {
                const label = method.type;
                const address = method.id || '0';
                const currency = method.currency || 'Euro';
                const available = method.availability; // available=true means the method is shown

                if (connection.isPostgreSQL) {
                    const insertQuery = `
                    INSERT INTO dc_pos.payment_methods (label, address, currency, available)
                    VALUES ($1, $2, $3, $4)
                `;
                    await connection.execute(insertQuery, [label, address, currency, available]);
                } else {
                    const insertQuery = `
                    INSERT INTO payment_methods (label, address, currency, available)
                    VALUES (?, ?, ?, ?)
                `;
                    await connection.execute(insertQuery, [label, address, currency, available ? 1 : 0]);
                }
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating payment methods:', error);
        return NextResponse.json({ error: 'An error occurred while updating payment methods' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
