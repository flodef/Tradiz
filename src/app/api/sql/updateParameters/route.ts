import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection, withTransaction } from '../db';
import { PARAMETER_KEY_LIST } from '@/app/constants/parameterKeys';
import { insertAuditEvent } from '../auditHelpers';

interface ParameterUpdate {
    key: string;
    value: string;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { parameters, changedBy } = await request.json();

        if (!parameters || !Array.isArray(parameters)) {
            return NextResponse.json({ error: 'Invalid parameters format' }, { status: 400 });
        }

        connection = await getPosDb(shopId);
        const conn = connection;

        await withTransaction(conn, async () => {
            const updatedKeys: string[] = [];
            // Update each parameter, but only if it's a known parameter key
            for (const param of parameters as ParameterUpdate[]) {
                // Only update known parameter keys
                if (!PARAMETER_KEY_LIST.includes(param.key as (typeof PARAMETER_KEY_LIST)[number])) {
                    console.warn(`Unknown parameter key: ${param.key}, skipping`);
                    continue;
                }

                if (conn.isPostgreSQL) {
                    // PostgreSQL: atomic upsert via ON CONFLICT on the unique param_key.
                    // Requires the unique constraint added by migrate-parameters-unique-key.sql.
                    await conn.execute(
                        `INSERT INTO dc_pos.parameters (param_key, param_value)
                         VALUES ($1, $2)
                         ON CONFLICT (param_key) DO UPDATE
                         SET param_value = EXCLUDED.param_value, updated_at = CURRENT_TIMESTAMP`,
                        [param.key, param.value]
                    );
                } else {
                    // MariaDB: ON DUPLICATE KEY UPDATE (updated_at has ON UPDATE current_timestamp())
                    const query = `
                        INSERT INTO parameters (param_key, param_value)
                        VALUES (?, ?)
                        ON DUPLICATE KEY UPDATE param_value = VALUES(param_value)
                    `;
                    await conn.execute(query, [param.key, param.value]);
                }
                updatedKeys.push(param.key);
            }

            if (updatedKeys.length > 0) {
                await insertAuditEvent(conn, {
                    event_type: 'parameter_change',
                    entity_type: 'parameters',
                    entity_id: updatedKeys.join(','),
                    user_name: changedBy || 'admin',
                    detail: `Updated ${updatedKeys.length} parameter(s): ${updatedKeys.join(', ')}`,
                });
            }
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating parameters' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
