import { Config, Parameters } from '../contexts/ConfigProvider';
import {
    Color,
    Currency,
    Customer,
    Discount,
    InventoryItem,
    Mercurial,
    PaymentMethod,
    Printer,
    Role,
    User,
} from '../utils/interfaces';
import { DEBIT_KEYWORD, DEV_EMAIL, PROVISION_KEYWORD } from './constants';
import './extensions';
import { generateSimpleId } from './id';

export class MissingDataError extends Error {
    name = 'MissingDataError';
    dataName?: string;
    isAdmin?: boolean;
    constructor(dataName?: string, isAdmin = false) {
        super(dataName ? `Données manquantes: ${dataName}` : 'Données manquantes');
        this.message = dataName ? `Données manquantes: ${dataName}` : 'Données manquantes';
        this.dataName = dataName;
        this.isAdmin = isAdmin;
    }
}
class AppOfflineError extends Error {
    name = 'AppOfflineError';
    message = "L'application est hors ligne";
}
export class DatabaseNotConfiguredError extends Error {
    name = 'DatabaseNotConfiguredError';
    message = 'Database not configured';
}
export class TooManyRequestsError extends Error {
    name = 'TooManyRequestsError';
    message = 'Too many requests. Please try again later.';
}
export class UserNotFoundError extends Error {
    name = 'UserNotFoundError';
    message = 'Utilisateur non identifié';
    constructor(email: string | undefined) {
        super(`Utilisateur non identifié: ${email}`, { cause: email });
    }
}

/**
 * Resolves user from public key by calling server-side API.
 * Returns the found user or null if not authenticated.
 * Never exposes full user list - authentication happens server-side.
 */
export async function resolveUserFromKey(
    publicKey: string | undefined
): Promise<{ user: User | null; foundUser: User | undefined; noUsers?: boolean }> {
    if (!publicKey) {
        return {
            user: null,
            foundUser: undefined,
        };
    }

    try {
        // Collect browser data for logging
        const browserData = {
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        const resolveResponse = await fetch('/api/sql/resolveUser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publicKey, browserData }),
        });

        if (resolveResponse.ok) {
            const { user: resolvedUser, noUsers } = await resolveResponse.json();
            const foundUser = resolvedUser || undefined;
            const user: User | null = foundUser || null;
            return { user, foundUser, noUsers };
        } else if (resolveResponse.status === 429) {
            // Too many requests - throw specific error
            throw new TooManyRequestsError();
        }
    } catch (error) {
        // Rethrow our rate-limit error so callers can handle it; swallow network errors
        if (error instanceof TooManyRequestsError) {
            throw error;
        }
        // Network error - return null
    }

    return {
        user: null,
        foundUser: undefined,
    };
}

interface RawParameters {
    keys: (string | undefined)[];
    values: (string | undefined)[];
}

/**
 * Builds Parameters object from raw parameter data.
 */
export function buildParameters(param: RawParameters, user: User, devEmail: string = DEV_EMAIL): Parameters {
    // Helper function: lookup by key first, then by index
    const getParamValue = (key: string, fallbackIndex: number): string => {
        const keyIndex = param.keys.findIndex((k) => k === key);
        return keyIndex !== -1 ? param.values.at(keyIndex) ?? '' : param.values.at(fallbackIndex) ?? '';
    };

    return {
        shop: {
            name: getParamValue('name', 0),
            address: getParamValue('address', 1),
            zipCode: getParamValue('zipCode', 2),
            city: getParamValue('city', 3),
            serial: getParamValue('serial', 4),
            id: getParamValue('id', 5),
            email: getParamValue('email', 6) || devEmail,
        },
        thanksMessage: getParamValue('thanksMessage', 7) || 'Merci de votre visite !',
        mercurial: (getParamValue('mercurial', 8) || Mercurial.none) as Mercurial,
        closingHour: Math.max(0, Math.min(23, Number(getParamValue('closingHour', 9)) || 0)),
        yearStartDate: (() => {
            try {
                const value = getParamValue('yearStartDate', 10);
                if (value) {
                    const parsed = JSON.parse(value);
                    if (parsed && typeof parsed.month === 'number' && typeof parsed.day === 'number') {
                        return parsed;
                    }
                }
            } catch {
                // Invalid JSON, use default
            }
            return { month: 1, day: 1 }; // Default to January 1st
        })(),
        lastModified: getParamValue('lastModified', 11) || new Date().toLocaleString(),
        user: user,
        products: (() => {
            try {
                const value = getParamValue('productsSettings', 12);
                if (value) {
                    const parsed = JSON.parse(value);
                    if (parsed && typeof parsed === 'object') {
                        return {
                            useVatPerProduct: parsed.useVatPerProduct ?? false,
                            useReference: parsed.useReference ?? false,
                            useStock: parsed.useStock ?? false,
                            usePhoto: parsed.usePhoto ?? false,
                            useDescription: parsed.useDescription ?? false,
                            useOptions: parsed.useOptions ?? false,
                        };
                    }
                }
            } catch {
                // Invalid JSON, use default
            }
            return undefined;
        })(),
        search: (() => {
            try {
                const value = getParamValue('searchSettings', 13);
                if (value) {
                    const parsed = JSON.parse(value);
                    if (parsed && typeof parsed === 'object') {
                        return {
                            searchCustomers: parsed.searchCustomers ?? false,
                            searchProducts: parsed.searchProducts ?? false,
                            searchUsers: parsed.searchUsers ?? false,
                        };
                    }
                }
            } catch {
                // Invalid JSON, use default
            }
            return undefined;
        })(),
        display: (() => {
            try {
                const value = getParamValue('displaySettings', 14);
                if (value) {
                    const parsed = JSON.parse(value);
                    if (parsed && typeof parsed === 'object') {
                        return {
                            showWaiting: parsed.showWaiting ?? true,
                            showRefund: parsed.showRefund ?? true,
                            showProvision: parsed.showProvision ?? true,
                            showDebit: parsed.showDebit ?? true,
                        };
                    }
                }
            } catch {
                // Invalid JSON, use default
            }
            return undefined;
        })(),
    };
}

interface ProductData {
    products: {
        rate: number;
        category: string;
        label: string;
        prices: number[];
        options?: string | null;
        stock?: number | null;
        order: number;
        reference?: string | null;
    }[];
    currencies: string[];
}

const dataNames: { [key: string]: string } = {
    parameters: 'getParameters',
    paymentMethods: 'getPaymentMethods',
    currencies: 'getCurrencies',
    discounts: 'getDiscounts',
    colors: 'getColors',
    printers: 'getPrinters',
    products: 'getAllArticles',
    customers: 'getCustomers',
    users: 'getUsers',
};

export const defaultParameters: Parameters = {
    shop: { name: '', email: DEV_EMAIL, address: '', zipCode: '', city: '', id: '', serial: '' },
    thanksMessage: '',
    mercurial: Mercurial.none,
    lastModified: new Date().toLocaleString(),
    closingHour: 0,
    yearStartDate: { month: 1, day: 1 }, // January 1st by default
    user: { name: '', role: Role.service },
    products: {
        useVatPerProduct: false,
        useReference: false,
        useStock: false,
        usePhoto: false,
        useDescription: false,
        useOptions: false,
    },
    search: {
        searchCustomers: false,
        searchProducts: false,
        searchUsers: false,
    },
    display: {
        showWaiting: true,
        showRefund: true,
        showProvision: true,
        showDebit: true,
    },
};

export const defaultCurrencies: Currency[] = [
    {
        label: 'Euro',
        maxValue: 999.99,
        symbol: '€',
        decimals: 2,
        rate: 1,
        fee: 0,
    },
];
export const defaultPaymentMethods: PaymentMethod[] = [
    {
        type: 'Carte Bancaire',
        currency: 'Euro',
        availability: true,
    },
    {
        type: 'Espèce',
        currency: 'Euro',
        availability: true,
    },
    {
        type: 'Chèque',
        currency: 'Euro',
        availability: true,
    },
];

export function getPublicKey() {
    let publicKey = localStorage.getItem('PublicKey');
    if (!publicKey) {
        publicKey = generateSimpleId();
        localStorage.setItem('PublicKey', publicKey);
    }
    return publicKey;
}

const loadDataCache = new Map<string, Promise<Config | undefined>>();

export function clearLoadDataCache() {
    loadDataCache.clear();
}

export async function loadData(shop: string, shouldUseLocalData = false): Promise<Config | undefined> {
    const cacheKey = `${shop}|${shouldUseLocalData}`;
    const cached = loadDataCache.get(cacheKey);
    if (cached) return cached;

    const promise = _loadDataImpl(shop, shouldUseLocalData).catch((err) => {
        loadDataCache.delete(cacheKey); // allow retry on error
        throw err;
    });
    loadDataCache.set(cacheKey, promise);
    return promise;
}

async function _loadDataImpl(_shop: string, _shouldUseLocalData = false): Promise<Config | undefined> {
    // Check if DB is configured
    const hasDbConfig = await checkDbConfig();
    if (!hasDbConfig) throw new DatabaseNotConfiguredError();
    if (!navigator.onLine) throw new AppOfflineError();

    // Resolve user server-side using the public key (never exposes full user list)
    const publicKey = getPublicKey();
    const { user, noUsers } = await resolveUserFromKey(publicKey);

    // If no users exist in database, throw MissingDataError
    if (noUsers) throw new MissingDataError('Utilisateurs', false);

    // Require authentication - if no user found, don't load data
    if (!user) throw new UserNotFoundError(publicKey);

    const isAdmin = user.role === 'Admin';
    const param = await fetchData(dataNames.parameters).then((response) => convertParametersData(response, isAdmin));

    const parameters = buildParameters(param, user!);

    const paymentMethods = await fetchData(dataNames.paymentMethods).then(convertPaymentMethodsData);
    const allCurrencies = await fetchData(dataNames.currencies).then(convertCurrenciesData);
    const discounts = await fetchData(dataNames.discounts).then(convertDiscountsData);
    const colors = await fetchData(dataNames.colors).then(convertColorsData);
    const printers = await fetchData(dataNames.printers).then(convertPrintersData);

    let data = await fetchData(dataNames.products).then(convertProductsData);

    // If getAllArticles failed or returned no products, allow admins/cashiers to proceed
    // so they can open the Edit Menu page and re-create the catalog. Other users get
    // the usual missing-products error.
    const hasEditAccess = user.role === Role.admin || user.role === Role.cashier;
    if (!data?.currencies?.length) {
        if (!data && allCurrencies.length) {
            // getAllArticles likely failed (e.g. 500 due to schema mismatch or empty table).
            // Fall back to the currency labels from getCurrencies so the admin can still load.
            data = { products: [], currencies: allCurrencies.map((c) => c.label) };
        } else {
            throw new MissingDataError('Devises', isAdmin);
        }
    }
    if (!data.products.length && !hasEditAccess) {
        throw new MissingDataError('Produits', isAdmin);
    }

    // Fetch customers and users
    const customers = await fetchData(dataNames.customers).then(convertCustomersData);
    const users = await fetchData(dataNames.users).then(convertUsersData);

    const currencies = data.currencies.map((item) => {
        const normalizedItem = item.normalizeCurrency();
        const currency = allCurrencies.find(({ label }) => label.normalizeCurrency() === normalizedItem);
        if (!currency) throw new Error(`currency not found: "${item}"`);
        return currency;
    });

    const inventory: InventoryItem[] = [];
    let categoryOrder = 0;
    data.products.forEach((item) => {
        const category = inventory.find(({ category }) => category === item.category);
        if (category) {
            category.products.push({
                label: item.label,
                prices: item.prices,
                options: item.options,
                stock: item.stock ?? null,
                order: item.order,
                reference: item.reference ?? null,
            });
        } else {
            inventory.push({
                category: item.category,
                rate: item.rate,
                order: categoryOrder++,
                products: [
                    {
                        label: item.label,
                        prices: item.prices,
                        options: item.options,
                        stock: item.stock ?? null,
                        order: item.order,
                        reference: item.reference ?? null,
                    },
                ],
            });
        }
    });

    return {
        parameters,
        currencies,
        paymentMethods,
        inventory,
        discounts,
        colors,
        printers,
        customers,
        users,
    };
}

// Cache for DB config check to avoid repeated API calls
let hasDbConfigCache: boolean | null = null;
let hasDbConfigCacheTime: number = 0;
let hasDbConfigPromise: Promise<boolean> | null = null;
export const DB_CONFIG_CACHE_TTL = 30_000; // 30 seconds — re-check if previously false

/**
 * Get the current cache state for testing purposes.
 */
export function getDbConfigCacheState(): {
    cache: boolean | null;
    cacheTime: number;
    promise: Promise<boolean> | null;
} {
    return { cache: hasDbConfigCache, cacheTime: hasDbConfigCacheTime, promise: hasDbConfigPromise };
}

/**
 * Set the cache state for testing purposes.
 */
export function setDbConfigCacheState(state: {
    cache?: boolean | null;
    cacheTime?: number;
    promise?: Promise<boolean> | null;
}): void {
    if (state.cache !== undefined) hasDbConfigCache = state.cache;
    if (state.cacheTime !== undefined) hasDbConfigCacheTime = state.cacheTime;
    if (state.promise !== undefined) hasDbConfigPromise = state.promise;
}

export function clearDbConfigCache() {
    hasDbConfigCache = null;
    hasDbConfigCacheTime = 0;
    hasDbConfigPromise = null;
}

/**
 * Internal implementation of checkDbConfig that accepts a custom fetcher.
 * Exported for testing purposes - allows injecting mock fetchers while testing real cache logic.
 */
export async function checkDbConfigWithFetcher(fetcher: () => Promise<boolean>): Promise<boolean> {
    const now = Date.now();
    // Use cache only if it's true (stable) or still within TTL
    if (hasDbConfigCache !== null && (hasDbConfigCache === true || now - hasDbConfigCacheTime < DB_CONFIG_CACHE_TTL)) {
        return hasDbConfigCache;
    }
    if (hasDbConfigPromise !== null) return hasDbConfigPromise;

    hasDbConfigPromise = fetcher()
        .then((hasDbConfig) => {
            hasDbConfigCache = hasDbConfig;
            hasDbConfigCacheTime = Date.now();
            hasDbConfigPromise = null;
            return hasDbConfig;
        })
        .catch(() => {
            hasDbConfigCache = false;
            hasDbConfigCacheTime = Date.now();
            hasDbConfigPromise = null;
            return false;
        });

    return hasDbConfigPromise;
}

export async function checkDbConfig(): Promise<boolean> {
    return checkDbConfigWithFetcher(async () => {
        const response = await fetch('/api/sql/getDbConfig');
        const data = await response.json();
        return data.hasDbConfig as boolean;
    });
}

async function fetchData(dataName: string) {
    // Always use DB
    const url = `/api/sql/${dataName}`;
    return await fetch(url).catch((error) => console.error(error));
}

async function convertParametersData(
    response: void | Response,
    isAdmin = false
): Promise<{ keys: (string | undefined)[]; values: (string | undefined)[] }> {
    if (typeof response === 'undefined') throw new MissingDataError('Paramètres', isAdmin);
    const data: { parameters?: { key: string; value: string }[]; error?: { message: string } } = await response.json();
    if (data.error?.message) throw new Error(data.error.message);
    if (!data.parameters?.length) throw new MissingDataError('Paramètres', isAdmin);

    return {
        keys: data.parameters.map((item) => item.key),
        values: data.parameters.map((item) => item.value),
    };
}

async function convertPaymentMethodsData(response: void | Response): Promise<PaymentMethod[]> {
    try {
        if (typeof response === 'undefined') return defaultPaymentMethods;
        const data: { paymentMethods?: PaymentMethod[]; error?: { message: string } } = await response.json();
        if (data.error?.message) throw new Error(data.error.message);
        if (!data.paymentMethods?.length) return defaultPaymentMethods;
        return data.paymentMethods
            .map((item) => ({ ...item, type: normalizedString(item.type) }))
            .filter(
                (item) =>
                    item.type.toLowerCase() !== PROVISION_KEYWORD.toLowerCase() &&
                    item.type.toLowerCase() !== DEBIT_KEYWORD.toLowerCase()
            );
    } catch (error) {
        console.error(error);
        return defaultPaymentMethods;
    }
}

async function convertCurrenciesData(response: void | Response): Promise<Currency[]> {
    try {
        if (typeof response === 'undefined') return defaultCurrencies;
        const data: { currencies?: Currency[]; error?: { message: string } } = await response.json();
        if (data.error?.message) throw new Error(data.error.message);
        if (!data.currencies?.length) return defaultCurrencies;
        return data.currencies.map((item) => ({ ...item, label: normalizedString(item.label) }));
    } catch (error) {
        console.error(error);
        return defaultCurrencies;
    }
}

async function convertDiscountsData(response: void | Response): Promise<Discount[]> {
    try {
        if (typeof response === 'undefined') return [];
        const data: { discounts?: Discount[]; error?: { message: string } } = await response.json();
        if (data.error?.message) throw new Error(data.error.message);
        return data.discounts ?? [];
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertColorsData(response: void | Response): Promise<Color[]> {
    try {
        if (typeof response === 'undefined') return [];
        const data: { colors?: Color[]; error?: { message: string } } = await response.json();
        if (data.error?.message) throw new Error(data.error.message);
        return data.colors ?? [];
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertPrintersData(response: void | Response): Promise<Printer[]> {
    try {
        if (typeof response === 'undefined') return [];
        const data: { printers?: Printer[]; error?: { message: string } } = await response.json();
        if (data.error?.message) throw new Error(data.error.message);
        return data.printers ?? [];
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertCustomersData(response: void | Response): Promise<Customer[]> {
    try {
        if (typeof response === 'undefined') return [];
        const data: { customers?: Customer[]; error?: { message: string } } = await response.json();
        if (data.error?.message) throw new Error(data.error.message);
        return data.customers ?? [];
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertUsersData(response: void | Response): Promise<User[]> {
    try {
        if (typeof response === 'undefined') return [];
        const data: { users?: User[]; error?: { message: string } } = await response.json();
        if (data.error?.message) throw new Error(data.error.message);
        return data.users ?? [];
    } catch (error) {
        console.error(error);
        return [];
    }
}

interface RawProduct {
    rate: number | null;
    category: string;
    label: string;
    stock: number | null;
    reference: string | null;
    photo: string;
    description: string;
    prices: number[];
    options: string | null;
}

async function convertProductsData(response: void | Response): Promise<ProductData | undefined> {
    try {
        if (typeof response === 'undefined') return;
        const data: { products?: RawProduct[]; currencies?: string[]; error?: string | { message: string } } =
            await response.json();
        // getAllArticles returns a plain string error on 500; object errors may also be present.
        const errorMessage = typeof data.error === 'string' ? data.error : data.error?.message;
        if (errorMessage) throw new Error(errorMessage);
        if (!data.currencies?.length) return;

        // Ignore products missing a category or a label
        const filtered = (data.products ?? []).filter((p) => p.category?.trim() !== '' && p.label?.trim() !== '');

        return {
            products: filtered.map((p, order) => ({
                rate: (p.rate ?? 0) * 100,
                category: normalizedString(p.category),
                label: normalizedString(p.label),
                stock: p.stock ?? null,
                reference: p.reference != null ? String(p.reference).trim() : null,
                order,
                prices: p.prices.map((price) => Number(price)),
                options: p.options ?? null,
            })),
            currencies: data.currencies.map((currency) => String(currency).trim()),
        };
    } catch (error) {
        console.error(error);
        return;
    }
}

const normalizedString = (value: unknown) => String(value).toFirstUpperCase();
