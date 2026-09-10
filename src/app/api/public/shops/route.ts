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

const SHOP_PARAM_KEYS = ['name', 'logo', 'shopImage', 'address', 'zipCode', 'city'];

export async function GET() {
    // Fetch all shops in parallel — each opens its own DB connection
    const results = await Promise.all(
        SHOP_IDS.map(async (shopId) => {
            try {
                return await withPosDb(shopId, async (conn) => {
                    // Only fetch the parameter keys we actually need
                    const placeholders = conn.isPostgreSQL
                        ? SHOP_PARAM_KEYS.map((_, i) => `$${i + 1}`).join(', ')
                        : SHOP_PARAM_KEYS.map(() => '?').join(', ');
                    const query = conn.isPostgreSQL
                        ? `SELECT param_key, param_value FROM dc_pos.parameters WHERE param_key IN (${placeholders})`
                        : `SELECT param_key, param_value FROM parameters WHERE param_key IN (${placeholders})`;
                    const [rows] = await conn.execute(query, SHOP_PARAM_KEYS);
                    const params = rows as { param_key: string; param_value: string }[];
                    const getParam = (key: string): string =>
                        params.find((p) => p.param_key === key)?.param_value ?? '';
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
            } catch {
                // Shop database unreachable — skip it
                return null;
            }
        })
    );

    const shops = results.filter((s): s is NonNullable<typeof s> => s !== null) as ShopSummary[];
    return NextResponse.json({ shops }, { status: 200 });
}
