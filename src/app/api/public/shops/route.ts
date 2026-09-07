import { NextResponse } from 'next/server';
import { withPosDb } from '../../sql/db';
import { SHOP_IDS } from '../../../constants/shops';

export const dynamic = 'force-dynamic';

interface ShopSummary {
    id: string;
    name: string;
    logo: string;
    image: string;
    address: string;
    zipCode: string;
    city: string;
}

export async function GET() {
    const shops: ShopSummary[] = [];

    for (const shopId of SHOP_IDS) {
        try {
            const shop = await withPosDb(shopId, async (conn) => {
                const query = conn.isPostgreSQL
                    ? `SELECT param_key, param_value FROM dc_pos.parameters ORDER BY id`
                    : `SELECT param_key, param_value FROM parameters ORDER BY id`;
                const [rows] = await conn.execute(query);
                const params = rows as { param_key: string; param_value: string }[];
                const getParam = (key: string): string => params.find((p) => p.param_key === key)?.param_value ?? '';
                return {
                    id: shopId,
                    name: getParam('name') || shopId,
                    logo: getParam('logo'),
                    image: getParam('shopImage'),
                    address: getParam('address'),
                    zipCode: getParam('zipCode'),
                    city: getParam('city'),
                };
            });
            shops.push(shop);
        } catch {
            // Shop database unreachable — skip it
        }
    }

    return NextResponse.json({ shops }, { status: 200 });
}
