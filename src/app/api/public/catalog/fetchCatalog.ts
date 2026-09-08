import { NextResponse } from 'next/server';
import { getMainDb, getPosDb, DbConnection } from '../../sql/db';

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
        mainConn = await getMainDb(shopId);
        posConn = await getPosDb(shopId);

        // Fetch products with category, stock, photo, description
        // Only include products whose category has no company assigned (public categories).
        // Categories tied to a specific company (e.g. Alcatel, Genesis) are excluded.
        const queryProducts = mainConn.isPostgreSQL
            ? `
            SELECT p.name as label, p.price as amount,
                   COALESCE(c.name, '') as category, p.stock, p.photo, p.description,
                   p.sort_order
            FROM dc.products p
            LEFT JOIN dc.categories c ON p.category_id = c.id
            WHERE c.company_id IS NULL
            ORDER BY c.sort_order ASC, p.sort_order ASC
        `
            : `
            SELECT p.name as label, p.price as amount,
                   COALESCE(c.name, '') as category, p.stock, p.photo, p.description,
                   p.sort_order
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE c.company_id IS NULL
            ORDER BY c.sort_order ASC, p.sort_order ASC
        `;
        const [productRows] = await mainConn.execute(queryProducts);

        // Fetch parameters for shop info
        const queryParams = posConn.isPostgreSQL
            ? `SELECT param_key, param_value FROM dc_pos.parameters ORDER BY id`
            : `SELECT param_key, param_value FROM parameters ORDER BY id`;
        const [paramRows] = await posConn.execute(queryParams);

        // Fetch currencies
        let currencies: {
            label: string;
            symbol: string;
            maxValue: number;
            decimals: number;
            rate: number;
            fee: number;
        }[];
        try {
            const [curRows] = await posConn.execute(
                'SELECT label, symbol, max_value, decimals, rate, fee FROM currencies'
            );
            const cRows = curRows as CurrencyRow[];
            currencies = cRows.length
                ? cRows.map((r) => ({
                      label: r.label,
                      symbol: r.symbol,
                      maxValue: r.max_value ?? 999.99,
                      decimals: r.decimals ?? 2,
                      rate: r.rate ?? 1,
                      fee: r.fee ?? 0,
                  }))
                : defaultCurrencies;
        } catch {
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
