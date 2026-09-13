import { NextResponse } from 'next/server';
import { getMainDb, getPosDb, DbConnection } from '../../sql/db';
import { readSubscription } from '../../sql/subscriptionStore';
import { SUBSCRIPTION_PLANS } from '@/app/utils/subscription';

interface ArticleRow {
    label: string;
    amount: string;
    category: string;
    stock: number | null;
    photo: string;
    description: string;
    sort_order: number;
}

interface ParameterRow {
    param_key: string;
    param_value: string;
}

interface CurrencyRow {
    label: string;
    symbol: string;
    max_value: number | null;
    decimals: number | null;
    rate: number | null;
    fee: number | null;
}

const defaultCurrencies = [{ label: 'Euro', maxValue: 999.99, symbol: '€', decimals: 2, rate: 1, fee: 0 }];

/**
 * Fetch the full public catalog (shop info, currencies, articles, opening hours,
 * reservation flags) for a given shop ID.
 *
 * Shared by both the host-based route (`/api/public/catalog`) and the
 * path-based route (`/api/public/catalog/[shopId]`).
 */
export async function fetchCatalog(shopId: string) {
    let mainConn: DbConnection | undefined;
    let posConn: DbConnection | undefined;
    try {
        // Open both connections in parallel — Neon cold starts can take several
        // seconds each, so sequential acquisition doubles the wait time.
        // Use allSettled to avoid leaking a connection if the other rejects.
        const [mainResult, posResult] = await Promise.allSettled([getMainDb(shopId), getPosDb(shopId)]);
        mainConn = mainResult.status === 'fulfilled' ? mainResult.value : undefined;
        posConn = posResult.status === 'fulfilled' ? posResult.value : undefined;
        if (mainResult.status === 'rejected' || posResult.status === 'rejected') {
            await mainConn?.end();
            await posConn?.end();
            throw mainResult.status === 'rejected'
                ? (mainResult as PromiseRejectedResult).reason
                : (posResult as PromiseRejectedResult).reason;
        }

        // Plan limit: the online site requires Pro or above.
        const sub = await readSubscription(posConn!);
        if (!SUBSCRIPTION_PLANS[sub.plan].limits.onlineSite) {
            await mainConn?.end();
            await posConn?.end();
            return NextResponse.json({ error: 'Site en ligne non inclus dans cette formule' }, { status: 403 });
        }

        // Fetch products (main DB) and parameters + currencies (POS DB) in parallel
        const queryProducts = mainConn!.isPostgreSQL
            ? `
            SELECT p.name as label, p.price as amount,
                   COALESCE(c.name, '') as category, p.stock, p.photo, p.description,
                   p.sort_order
            FROM dc.products p
            INNER JOIN dc.categories c ON p.category_id = c.id
            WHERE c.company_id IS NULL
            ORDER BY c.sort_order ASC, p.sort_order ASC
        `
            : `
            SELECT p.name as label, p.price as amount,
                   COALESCE(c.name, '') as category, p.stock, p.photo, p.description,
                   p.sort_order
            FROM products p
            INNER JOIN categories c ON p.category_id = c.id
            WHERE c.company_id IS NULL
            ORDER BY c.sort_order ASC, p.sort_order ASC
        `;

        // Only fetch the parameter keys we actually need
        const SHOP_PARAM_KEYS = [
            'name',
            'address',
            'zipCode',
            'city',
            'phone',
            'email',
            'logo',
            'shopImage',
            'reservationPhone',
            'reservationEmail',
            'openingHours',
            'googlePlaceId',
        ];
        const paramPlaceholders = posConn!.isPostgreSQL
            ? SHOP_PARAM_KEYS.map((_, i) => `$${i + 1}`).join(', ')
            : SHOP_PARAM_KEYS.map(() => '?').join(', ');
        const queryParams = posConn!.isPostgreSQL
            ? `SELECT param_key, param_value FROM dc_pos.parameters WHERE param_key IN (${paramPlaceholders})`
            : `SELECT param_key, param_value FROM parameters WHERE param_key IN (${paramPlaceholders})`;

        const [productRows, paramRows, curRows] = await Promise.all([
            mainConn!.execute(queryProducts).then(([rows]) => rows),
            posConn!.execute(queryParams, SHOP_PARAM_KEYS).then(([rows]) => rows),
            posConn!
                .execute('SELECT label, symbol, max_value, decimals, rate, fee FROM currencies')
                .then(([rows]) => rows)
                .catch(() => null),
        ]);

        // Build currencies
        let currencies: {
            label: string;
            symbol: string;
            maxValue: number;
            decimals: number;
            rate: number;
            fee: number;
        }[];
        const cRows = curRows as CurrencyRow[] | null;
        if (cRows && cRows.length) {
            currencies = cRows.map((r) => ({
                label: r.label,
                symbol: r.symbol,
                maxValue: r.max_value ?? 999.99,
                decimals: r.decimals ?? 2,
                rate: r.rate ?? 1,
                fee: r.fee ?? 0,
            }));
        } else {
            currencies = defaultCurrencies;
        }

        // Build shop info from parameters
        const params = paramRows as ParameterRow[];
        const getParam = (key: string): string => {
            const row = params.find((p) => p.param_key === key);
            return row?.param_value ?? '';
        };

        const shop = {
            name: getParam('name'),
            address: getParam('address'),
            zipCode: getParam('zipCode'),
            city: getParam('city'),
            phone: getParam('phone'),
            email: getParam('email'),
            logo: getParam('logo'),
            image: getParam('shopImage'),
            googlePlaceId: getParam('googlePlaceId'),
        };

        const reservationPhone = getParam('reservationPhone') === 'true';
        const reservationEmail = getParam('reservationEmail') === 'true';

        // Parse opening hours from parameters
        let openingHours: Record<number, { open: string; close: string }[]> | undefined;
        try {
            const ohValue = getParam('openingHours');
            if (ohValue) {
                const parsed = JSON.parse(ohValue);
                if (parsed && typeof parsed === 'object') {
                    openingHours = parsed as Record<number, { open: string; close: string }[]>;
                }
            }
        } catch {
            // Invalid JSON
        }

        // Build product list grouped by category
        const articles = (productRows as ArticleRow[]).map((row) => ({
            label: String(row.label),
            price: Number(row.amount) || 0,
            category: String(row.category || 'Autres'),
            stock: row.stock != null ? Number(row.stock) : null,
            photo: String(row.photo || ''),
            description: String(row.description || ''),
        }));

        return NextResponse.json(
            { shop, currencies, articles, openingHours, reservationPhone, reservationEmail },
            { status: 200 }
        );
    } catch (error) {
        console.error('public/catalog error:', error);
        return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
    } finally {
        await mainConn?.end();
        await posConn?.end();
    }
}
