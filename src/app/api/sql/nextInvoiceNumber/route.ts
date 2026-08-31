import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { companyId, period } = await request.json() as { companyId: number; period: string };

        if (!companyId || !period || !/^\d{6}$/.test(period)) {
            return NextResponse.json({ error: 'Invalid companyId or period (expected YYYYMM)' }, { status: 400 });
        }

        connection = await getPosDb(shopId);
        const isPg = connection.isPostgreSQL;
        const prefix = isPg ? 'dc_pos.' : '';
        const paramKey = `invoiceSeq-${companyId}-${period}`;

        await connection.beginTransaction();
        try {
            // Read current sequence value
            const selectQuery = isPg
                ? `SELECT param_value FROM ${prefix}parameters WHERE param_key = $1`
                : `SELECT param_value FROM parameters WHERE param_key = ?`;
            const [rows] = await connection.execute(selectQuery, [paramKey]);
            const currentSeq = Number((rows as { param_value: string }[])[0]?.param_value ?? 0);
            const nextSeq = currentSeq + 1;

            // Upsert the new sequence value
            if (isPg) {
                await connection.execute(
                    `INSERT INTO ${prefix}parameters (param_key, param_value)
                     VALUES ($1, $2)
                     ON CONFLICT (param_key) DO UPDATE
                     SET param_value = EXCLUDED.param_value, updated_at = CURRENT_TIMESTAMP`,
                    [paramKey, String(nextSeq)]
                );
            } else {
                await connection.execute(
                    `INSERT INTO parameters (param_key, param_value)
                     VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE param_value = VALUES(param_value)`,
                    [paramKey, String(nextSeq)]
                );
            }

            await connection.commit();
            await connection.end();

            const invoiceNumber = `FAC-${period}-${companyId}-${nextSeq}`;
            return NextResponse.json({ invoiceNumber }, { status: 200 });
        } catch (error) {
            await connection.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error generating invoice number:', error);
        return NextResponse.json({ error: 'An error occurred while generating invoice number' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
