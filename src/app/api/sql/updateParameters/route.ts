import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';
import { PARAMETER_KEY_LIST } from '@/app/constants/parameterKeys';

interface ParameterUpdate {
    key: string;
    value: string;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const { parameters } = await request.json();

        if (!parameters || !Array.isArray(parameters)) {
            return NextResponse.json({ error: 'Invalid parameters format' }, { status: 400 });
        }

        const connection = await getPosDb(shopId);

        // Update each parameter, but only if it's a known parameter key
        for (const param of parameters as ParameterUpdate[]) {
            // Only update known parameter keys
            if (!PARAMETER_KEY_LIST.includes(param.key as (typeof PARAMETER_KEY_LIST)[number])) {
                console.warn(`Unknown parameter key: ${param.key}, skipping`);
                continue;
            }

            if (connection.isPostgreSQL) {
                // PostgreSQL: Check if parameter exists, then update or insert
                const [existing] = await connection.execute('SELECT id FROM dc_pos.parameters WHERE param_key = $1', [
                    param.key,
                ]);
                const rows = existing as { id: number }[];

                if (rows.length > 0) {
                    // Update existing
                    await connection.execute('UPDATE dc_pos.parameters SET param_value = $1 WHERE param_key = $2', [
                        param.value,
                        param.key,
                    ]);
                } else {
                    // Insert new
                    await connection.execute('INSERT INTO dc_pos.parameters (param_key, param_value) VALUES ($1, $2)', [
                        param.key,
                        param.value,
                    ]);
                }
            } else {
                // MariaDB: Use ON DUPLICATE KEY UPDATE
                const query = `
                    INSERT INTO parameters (param_key, param_value)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE param_value = VALUES(param_value)
                `;
                await connection.execute(query, [param.key, param.value]);
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating parameters' }, { status: 500 });
    }
}
