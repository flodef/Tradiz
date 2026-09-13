import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';
import { Currency } from '@/app/utils/interfaces';
import { insertAuditEvent } from '../auditHelpers';
import { readSubscription, stoppedSubscriptionResponse } from '../subscriptionStore';
import { SUBSCRIPTION_PLANS } from '@/app/utils/subscription';

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { currencies } = await request.json();

        if (!currencies || !Array.isArray(currencies)) {
            return NextResponse.json({ error: 'Invalid currencies format' }, { status: 400 });
        }

        connection = await getPosDb(shopId);

        // Plan limit: multi-devises requires Pro or above (Découverte = 1).
        const sub = await readSubscription(connection);
        if (sub.status === 'stopped') return stoppedSubscriptionResponse();
        const limits = SUBSCRIPTION_PLANS[sub.plan].limits;
        if (currencies.length > limits.maxCurrencies) {
            return NextResponse.json(
                {
                    error: `Votre formule ${SUBSCRIPTION_PLANS[sub.plan].name} est limitée à ${limits.maxCurrencies} devise(s). Passez à une formule supérieure pour le multi-devises.`,
                },
                { status: 403 }
            );
        }

        // Check if currencies table exists, if not create it
        const createTableQuery = connection.isPostgreSQL
            ? `
            CREATE TABLE IF NOT EXISTS dc_pos.currencies (
                label VARCHAR(50) PRIMARY KEY,
                symbol VARCHAR(10) NOT NULL,
                max_value DECIMAL(12,4) DEFAULT 999.99,
                decimals INTEGER DEFAULT 2,
                rate DECIMAL(12,6) DEFAULT 1,
                fee DECIMAL(5,2) DEFAULT 0
            )
        `
            : `
            CREATE TABLE IF NOT EXISTS currencies (
                label VARCHAR(50) PRIMARY KEY,
                symbol VARCHAR(10) NOT NULL,
                max_value DECIMAL(12,4) DEFAULT 999.99,
                decimals INT DEFAULT 2,
                rate DECIMAL(12,6) DEFAULT 1,
                fee DECIMAL(5,2) DEFAULT 0
            ) ENGINE=InnoDB
        `;
        await connection.execute(createTableQuery);

        // Clear and re-insert atomically so a mid-insert failure cannot leave
        // the shop with an empty currency table.
        await connection.beginTransaction();
        try {
            const deleteQuery = connection.isPostgreSQL ? 'DELETE FROM dc_pos.currencies' : 'DELETE FROM currencies';
            await connection.execute(deleteQuery);

            for (const currency of currencies as Currency[]) {
                const query = connection.isPostgreSQL
                    ? `
                    INSERT INTO dc_pos.currencies (label, symbol, max_value, decimals, rate, fee)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `
                    : `
                    INSERT INTO currencies (label, symbol, max_value, decimals, rate, fee)
                    VALUES (?, ?, ?, ?, ?, ?)
                `;
                await connection.execute(query, [
                    currency.label,
                    currency.symbol,
                    currency.maxValue,
                    currency.decimals,
                    currency.rate,
                    currency.fee,
                ]);
            }

            await insertAuditEvent(connection, {
                event_type: 'currency_change',
                entity_type: 'currencies',
                entity_id: 'currencies',
                user_name: 'admin',
                detail: `Updated ${currencies.length} currency/currencies`,
            });

            await connection.commit();
        } catch (e) {
            await connection.rollback();
            throw e;
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating currencies' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
