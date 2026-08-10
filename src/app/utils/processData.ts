import { SHOP_ID } from '../constants/shop';
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
    CategoryData,
} from '../utils/interfaces';
import {
    CURRENT_USER_KEYWORD,
    DEBIT_KEYWORD,
    DEFAULT_CATEGORY,
    DEV_EMAIL,
    IS_DEV,
    PROVISION_KEYWORD,
} from './constants';
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
        lastModified: getParamValue('lastModified', 11) || Date.now().toString(),
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
                            useColor: parsed.useColor ?? false,
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
                            showChange: parsed.showChange ?? true,
                            catalogMode: parsed.catalogMode ?? false,
                            useTakeOut: parsed.useTakeOut ?? true,
                        };
                    }
                }
            } catch {
                // Invalid JSON, use default
            }
            return undefined;
        })(),
        userSwitch: (() => {
            const value = getParamValue('userSwitch', 15);
            if (value === '') return undefined;
            return value !== 'false';
        })(),
        useVirtualKeyboard: (() => {
            const value = getParamValue('useVirtualKeyboard', 16);
            if (value === '') return undefined;
            return value === 'true';
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
        color?: string;
        sortOrder?: number;
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
    categories: 'getCategories',
};

// Each theme is a contiguous block of COLORS_PER_THEME entries in `defaultColors`,
// and `defaultThemeNames[i]` is the name of the i-th block.
export const COLORS_PER_THEME = 7;

export const defaultThemeNames: string[] = ['Défaut', 'Océan', 'Coucher de soleil', 'Lavande', 'Forêt', 'Cerise'];

export const defaultColors: Color[] = [
    // Theme 0: Défaut (Orange/Lime — original)
    { label: 'Texte', light: '#d97706', dark: '#facc15' },
    { label: 'Fond début dégradé', light: '#fff7ed', dark: '#65a30d' },
    { label: 'Fond fin dégradé', light: '#fed7aa', dark: '#14532d' },
    { label: 'Popup', light: '#f1f5f9', dark: '#713f12' },
    { label: 'Activé', light: '#fdba74', dark: '#84cc16' },
    { label: 'Secondaire', light: '#84cc16', dark: '#fdba74' },
    { label: 'Secondaire activé', light: '#a3e635', dark: '#f97316' },
    // Theme 1: Océan (Blue/Teal)
    { label: 'Texte', light: '#0e7490', dark: '#22d3ee' },
    { label: 'Fond début dégradé', light: '#ecfeff', dark: '#0e7490' },
    { label: 'Fond fin dégradé', light: '#a5f3fc', dark: '#083344' },
    { label: 'Popup', light: '#f0f9ff', dark: '#164e63' },
    { label: 'Activé', light: '#67e8f9', dark: '#06b6d4' },
    { label: 'Secondaire', light: '#06b6d4', dark: '#67e8f9' },
    { label: 'Secondaire activé', light: '#22d3ee', dark: '#0891b2' },
    // Theme 2: Coucher de soleil (Rose/Purple)
    { label: 'Texte', light: '#c026d3', dark: '#f0abfc' },
    { label: 'Fond début dégradé', light: '#fdf4ff', dark: '#a21caf' },
    { label: 'Fond fin dégradé', light: '#f5d0fe', dark: '#4a044e' },
    { label: 'Popup', light: '#fdf2f8', dark: '#701a75' },
    { label: 'Activé', light: '#f0abfc', dark: '#e879f9' },
    { label: 'Secondaire', light: '#e879f9', dark: '#f0abfc' },
    { label: 'Secondaire activé', light: '#f5d0fe', dark: '#d946ef' },
    // Theme 3: Lavande (Violet/Indigo)
    { label: 'Texte', light: '#6d28d9', dark: '#c4b5fd' },
    { label: 'Fond début dégradé', light: '#f5f3ff', dark: '#5b21b6' },
    { label: 'Fond fin dégradé', light: '#ddd6fe', dark: '#2e1065' },
    { label: 'Popup', light: '#f5f3ff', dark: '#4c1d95' },
    { label: 'Activé', light: '#c4b5fd', dark: '#8b5cf6' },
    { label: 'Secondaire', light: '#8b5cf6', dark: '#c4b5fd' },
    { label: 'Secondaire activé', light: '#a78bfa', dark: '#7c3aed' },
    // Theme 4: Forêt (Green/Emerald)
    { label: 'Texte', light: '#15803d', dark: '#86efac' },
    { label: 'Fond début dégradé', light: '#f0fdf4', dark: '#166534' },
    { label: 'Fond fin dégradé', light: '#bbf7d0', dark: '#052e16' },
    { label: 'Popup', light: '#f0fdf4', dark: '#14532d' },
    { label: 'Activé', light: '#86efac', dark: '#22c55e' },
    { label: 'Secondaire', light: '#22c55e', dark: '#86efac' },
    { label: 'Secondaire activé', light: '#4ade80', dark: '#16a34a' },
    // Theme 5: Cerise (Red/Rose)
    { label: 'Texte', light: '#be123c', dark: '#fb7185' },
    { label: 'Fond début dégradé', light: '#fff1f2', dark: '#9f1239' },
    { label: 'Fond fin dégradé', light: '#fecdd3', dark: '#4c0519' },
    { label: 'Popup', light: '#fff1f2', dark: '#881337' },
    { label: 'Activé', light: '#fda4af', dark: '#f43f5e' },
    { label: 'Secondaire', light: '#f43f5e', dark: '#fda4af' },
    { label: 'Secondaire activé', light: '#fb7185', dark: '#e11d48' },
];

export const defaultParameters: Parameters = {
    shop: { name: '', email: DEV_EMAIL, address: '', zipCode: '', city: '', id: '', serial: '' },
    thanksMessage: '',
    mercurial: Mercurial.none,
    lastModified: Date.now().toString(),
    closingHour: 0,
    yearStartDate: { month: 1, day: 1 }, // January 1st by default
    user: { name: '', role: Role.service },
    userSwitch: true,
    useVirtualKeyboard: false,
    products: {
        useVatPerProduct: false,
        useReference: false,
        useStock: false,
        usePhoto: false,
        useDescription: false,
        useOptions: false,
        useColor: false,
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
        showChange: true,
        catalogMode: false,
        useTakeOut: true,
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

let electronPublicKey: string | null = null;

export async function initPublicKey() {
    if (typeof window !== 'undefined' && window.electronAPI?.getPublicKey) {
        electronPublicKey = await window.electronAPI.getPublicKey();
    }
}

export function getPublicKey() {
    if (electronPublicKey) return electronPublicKey;

    let publicKey = localStorage.getItem('PublicKey');
    if (!publicKey) {
        publicKey = generateSimpleId();
        localStorage.setItem('PublicKey', publicKey);
    }

    if (typeof window !== 'undefined' && window.electronAPI?.setPublicKey) {
        window.electronAPI.setPublicKey(publicKey);
        electronPublicKey = publicKey;
    }

    return publicKey;
}

const loadDataCache = new Map<string, Promise<Config | undefined>>();

export function clearLoadDataCache() {
    loadDataCache.clear();
}

export async function loadData(): Promise<Config | undefined> {
    const shouldUseLocalData = IS_DEV;
    const cacheKey = `${SHOP_ID}|${shouldUseLocalData}`;
    const cached = loadDataCache.get(cacheKey);
    if (cached) return cached;

    const promise = _loadDataImpl().catch((err) => {
        loadDataCache.delete(cacheKey); // allow retry on error
        throw err;
    });
    loadDataCache.set(cacheKey, promise);
    return promise;
}

async function _loadDataImpl(): Promise<Config | undefined> {
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

    const isAdmin = user.role === Role.admin;
    const param = await fetchData(dataNames.parameters).then((response) => convertParametersData(response, isAdmin));

    const parameters = buildParameters(param, user!);

    const paymentMethods = await fetchData(dataNames.paymentMethods).then(convertPaymentMethodsData);
    const allCurrencies = await fetchData(dataNames.currencies).then(convertCurrenciesData);
    const discounts = await fetchData(dataNames.discounts).then(convertDiscountsData);
    const colors = await fetchData(dataNames.colors).then(convertColorsData);
    const printers = await fetchData(dataNames.printers).then(convertPrintersData);
    const categories = await fetchData(dataNames.categories)
        .then(convertCategoriesData)
        .catch(() => []);

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

    // Fetch customers. The full user list is only exposed to the client when user
    // switching is enabled; otherwise resolveUser already returned the single device user.
    const customers = await fetchData(dataNames.customers).then(convertCustomersData);
    const userSwitchEnabled = (parameters.userSwitch ?? true) as boolean;
    const users = userSwitchEnabled ? await fetchData(dataNames.users).then(convertUsersData) : [];

    // Prefer the user persisted in localStorage if it still exists in the users list.
    const savedUserJson = typeof window !== 'undefined' ? localStorage.getItem(CURRENT_USER_KEYWORD) : null;
    if (savedUserJson && users.length) {
        try {
            const savedUser = JSON.parse(savedUserJson) as User;
            if (
                users.some(
                    (u) =>
                        u.id === savedUser.id &&
                        u.name === savedUser.name &&
                        u.role === savedUser.role &&
                        u.reference === savedUser.reference
                )
            ) {
                parameters.user = savedUser;
            }
        } catch {
            // Invalid saved user, ignore
        }
    }

    const currencies = data.currencies.map((item) => {
        const normalizedItem = item.normalizeCurrency();
        const currency = allCurrencies.find(({ label }) => label.normalizeCurrency() === normalizedItem);
        if (!currency) throw new Error(`currency not found: "${item}"`);
        return currency;
    });

    // Build a category sort-order map from dc.categories (source of truth).
    // Categories not in the DB get a high order so they appear at the end.
    const categorySortOrder = new Map<string, number>();
    categories.forEach((c, i) => {
        categorySortOrder.set(c.name, c.sortOrder ?? i);
    });

    const inventory: InventoryItem[] = [];
    let categoryOrder = 0;
    data.products.forEach((item) => {
        const normalizedCategory = item.category || DEFAULT_CATEGORY;
        const category = inventory.find(({ category }) => category === normalizedCategory);
        if (category) {
            category.products.push({
                label: item.label,
                prices: item.prices,
                options: item.options,
                stock: item.stock ?? null,
                order: item.order,
                reference: item.reference ?? null,
                color: item.color ?? '',
                sortOrder: item.sortOrder ?? 0,
            });
        } else {
            inventory.push({
                category: normalizedCategory,
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
                        color: item.color ?? '',
                        sortOrder: item.sortOrder ?? 0,
                    },
                ],
            });
        }
    });

    // Sort inventory by dc.categories.sort_order (fall back to insertion order)
    inventory.sort((a, b) => {
        const orderA = categorySortOrder.get(a.category);
        const orderB = categorySortOrder.get(b.category);
        if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
        if (orderA !== undefined) return -1;
        if (orderB !== undefined) return 1;
        return a.order - b.order;
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
        categories,
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
        return data.currencies.map((item) => ({ ...item, label: String(item.label).normalizeCurrency() }));
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
        if (typeof response === 'undefined') return defaultColors;
        const data: { colors?: Color[]; error?: { message: string } } = await response.json();
        if (data.error?.message) throw new Error(data.error.message);
        if (!data.colors?.length) return defaultColors;
        return data.colors;
    } catch (error) {
        console.error(error);
        return defaultColors;
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

async function convertCategoriesData(response: void | Response): Promise<CategoryData[]> {
    try {
        if (typeof response === 'undefined') return [];
        const data: { categories?: CategoryData[]; error?: { message: string } } = await response.json();
        if (data.error?.message) throw new Error(data.error.message);
        return data.categories ?? [];
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
    color: string;
    prices: number[];
    options: string | null;
    sortOrder?: number;
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

        // Ignore products missing a label, but keep products without a category
        // (they are shown under the default category instead of being dropped).
        const filtered = (data.products ?? []).filter((p) => p.label?.trim() !== '');

        return {
            products: filtered.map((p, order) => ({
                rate: (p.rate ?? 0) * 100,
                category: p.category?.trim() ? normalizedString(p.category) : DEFAULT_CATEGORY,
                label: normalizedString(p.label),
                stock: p.stock ?? null,
                reference: p.reference != null ? String(p.reference).trim() : null,
                color: p.color ?? '',
                order,
                prices: p.prices.map((price) => Number(price)),
                options: p.options ?? null,
                sortOrder: p.sortOrder ?? 0,
            })),
            currencies: data.currencies.map((currency) => String(currency).trim()),
        };
    } catch (error) {
        console.error(error);
        return;
    }
}

const normalizedString = (value: unknown) => String(value).toFirstUpperCase();
