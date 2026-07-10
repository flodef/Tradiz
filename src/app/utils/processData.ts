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
import { DEV_EMAIL } from './constants';
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
class EmptyDataError extends Error {
    name = 'EmptyDataError';
    message = 'Données vides';
}
class WrongDataPatternError extends Error {
    name = 'WrongDataPatternError';
    constructor(message = 'Format de données incorrect') {
        super(message);
        this.message = message;
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
            throw new Error('Too many requests. Please try again later.');
        }
    } catch (error) {
        // Network error or other error - rethrow if it's our custom error
        if (error instanceof Error && error.message === 'Too many requests. Please try again later.') {
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

    const data = await fetchData(dataNames.products).then(convertProductsData);

    // Fetch customers and users
    const customers = await fetchData(dataNames.customers).then(convertCustomersData);
    const users = await fetchData(dataNames.users).then(convertUsersData);

    if (!data?.products?.length || !data?.currencies?.length) return;

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

function checkData(
    data: { values?: unknown[][]; error?: { message: string } },
    dataName: string,
    minCol: number,
    maxCol = minCol,
    minRow = 1,
    maxRow = 100000,
    isAdmin = false
) {
    if (!data) throw new Error('data not fetched');
    if (data.error?.message) throw new Error(data.error.message);
    if (!data.values?.length) throw new MissingDataError(dataName, isAdmin);
    if (
        data.values &&
        (data.values.length < minRow ||
            data.values.length > maxRow ||
            data.values[0].length < minCol ||
            data.values[0].length > maxCol)
    ) {
        const actualRows = data.values.length;
        const actualCols = data.values[0]?.length ?? 0;
        const context = dataName ? ` (${dataName})` : '';
        const formatRange = (min: number, max: number) =>
            min === max ? `exactement ${min}` : `entre ${min} et ${max}`;
        throw new WrongDataPatternError(
            `Format de données incorrect${context}: attendu ${formatRange(minRow, maxRow)} lignes et ${formatRange(minCol, maxCol)} colonnes, reçu ${actualRows} lignes et ${actualCols} colonnes`
        );
    }
}

function checkColumn(item: unknown[], rowContext: string, minCol: number) {
    if (item.length < minCol) {
        const context = rowContext ? ` (${rowContext})` : '';
        throw new WrongDataPatternError(
            `Format de colonne incorrect${context}: attendu au moins ${minCol} colonnes, reçu ${item.length} colonnes`
        );
    }
}

async function convertParametersData(
    response: void | Response,
    isAdmin = false
): Promise<{ keys: (string | undefined)[]; values: (string | undefined)[] }> {
    if (typeof response === 'undefined') throw new EmptyDataError();
    return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
        checkData(data, 'Paramètres', 1, 2, 6, 15, isAdmin);

        return {
            keys: data.values.map((item) => {
                checkColumn(item, 'Clé', 1);
                return item.at(0);
            }),
            values: data.values.map((item) => {
                checkColumn(item, 'Valeur', 1);
                return item.at(1);
            }),
        };
    });
}

async function convertPaymentMethodsData(response: void | Response): Promise<PaymentMethod[]> {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: (string | boolean)[][]; error: { message: string } }) => {
            checkData(data, 'Moyens de paiement', 4);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 'Moyens de paiement', 4);
                return {
                    type: normalizedString(item.at(0)),
                    id: String(item.at(1)).trim(),
                    currency: String(item.at(2)).trim(),
                    availability: Boolean(item.at(3)),
                };
            });
        });
    } catch (error) {
        console.error(error);
        return defaultPaymentMethods;
    }
}

async function convertCurrenciesData(response: void | Response): Promise<Currency[]> {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
            checkData(data, 'Devises', 4, 6);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 'Devises', 4);
                return {
                    label: normalizedString(item.at(0)),
                    maxValue: Number(item.at(1)),
                    symbol: String(item.at(2)).trim(),
                    decimals: Number(item.at(3)),
                    rate: item.length > 4 ? Number(item.at(4)) : 1,
                    fee: item.length > 5 ? Number(item.at(5)) : 0,
                };
            });
        });
    } catch (error) {
        console.error(error);
        return defaultCurrencies;
    }
}

async function convertDiscountsData(response: void | Response): Promise<Discount[]> {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
            checkData(data, 'Remises', 2);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 'Remises', 2);
                return {
                    amount: Number(item.at(0)),
                    unit: String(item.at(1)).trim(),
                };
            });
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertColorsData(response: void | Response): Promise<Color[]> {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
            checkData(data, 'Couleurs', 3, 3, 8, 8);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 'Couleurs', 3);
                return {
                    label: String(item.at(0)).trim(),
                    light: String(item.at(1)).trim(),
                    dark: String(item.at(2)).trim(),
                };
            });
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertPrintersData(response: void | Response): Promise<Printer[]> {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
            // Printers are optional, return empty array if no data
            if (!data.values?.length) {
                return [];
            }

            checkData(data, 'Imprimantes', 2);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 'Imprimantes', 2);
                return {
                    label: String(item.at(0)).trim(),
                    ipAddress: String(item.at(1)).trim(),
                };
            });
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertCustomersData(response: void | Response): Promise<Customer[]> {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
            // Customers are optional, return empty array if no data
            if (!data.values?.length || data.values.length < 2) {
                return [];
            }

            const headers = data.values[0];
            const rows = data.values.slice(1);

            return rows.map((row: (string | number)[]) => ({
                id: row[headers.indexOf('id')] as number,
                firstName: row[headers.indexOf('first_name')] as string,
                lastName: row[headers.indexOf('last_name')] as string,
                reference: row[headers.indexOf('reference')] as string | undefined,
                email: row[headers.indexOf('email')] as string | undefined,
                phone: row[headers.indexOf('phone')] as string | undefined,
            }));
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertUsersData(response: void | Response): Promise<User[]> {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
            // Users are optional, return empty array if no data
            if (!data.values?.length || data.values.length < 2) {
                return [];
            }

            const headers = data.values[0];
            const rows = data.values.slice(1);

            return rows.map((row: (string | number)[]) => ({
                key: row[headers.indexOf('key')] as string,
                name: row[headers.indexOf('name')] as string,
                role: row[headers.indexOf('role')] as Role,
                reference: row[headers.indexOf('reference')] as string | undefined,
            }));
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertProductsData(response: void | Response): Promise<ProductData | undefined> {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response
            .json()
            .then(
                (data: { values: (string | number)[][]; options?: (string | null)[]; error: { message: string } }) => {
                    checkData(data, 'Produits', 4, 10);

                    // Build a mapping from filtered row index → options string
                    const rowsAfterHeader = data.values.slice(1);
                    const optionsArr = data.options ?? [];

                    // Track which original rows survive the removeEmpty pipeline
                    const filtered = rowsAfterHeader
                        .map((item, origIdx) => ({ item, origIdx }))
                        .filter(({ item }) => item[1] != null && String(item[1]).trim() !== '')
                        .filter(({ item }) => item[2] != null && String(item[2]).trim() !== '');

                    return {
                        products: filtered.map(({ item, origIdx }, rowOrder) => {
                            checkColumn(item, 'Produits', 8);
                            return {
                                rate: Number(item.at(0)) * 100,
                                category: normalizedString(item.at(1)),
                                label: normalizedString(item.at(2)),
                                stock:
                                    item.at(3) === null || item.at(3) === undefined || item.at(3) === ''
                                        ? null
                                        : Number(item.at(3)) || 0,
                                reference: String(item[4]).trim(),
                                photo: String(item[5]).trim(),
                                description: String(item[6]).trim(),
                                order: rowOrder,
                                prices: item.filter((_, i) => i >= 7).map((price) => Number(price)),
                                options: optionsArr[origIdx] ?? null,
                            };
                        }),
                        currencies: data.values[0].filter((_, i) => i >= 7).map((currency) => String(currency).trim()),
                    };
                }
            );
    } catch (error) {
        console.error(error);
        return;
    }
}

const normalizedString = (value: unknown) => String(value).toFirstUpperCase();
