import { Config, Parameters } from '../contexts/ConfigProvider';
import {
    Color,
    Currency,
    Discount,
    InventoryItem,
    Mercurial,
    PaymentMethod,
    Printer,
    Role,
    User,
} from '../utils/interfaces';
import { DEFAULT_USER, EMAIL } from './constants';
import './extensions';
import { generateSimpleId } from './id';

class MissingDataError extends Error {
    name = 'MissingDataError';
    message = 'Données manquantes';
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
export class UserNotFoundError extends Error {
    name = 'UserNotFoundError';
    message = 'Utilisateur non identifié';
    constructor(email: string | undefined) {
        super(`Utilisateur non identifié: ${email}`, { cause: email });
    }
}

interface ProductData {
    products: {
        rate: number;
        category: string;
        label: string;
        prices: number[];
        options?: string | null;
        availability: boolean;
        order: number;
    }[];
    currencies: string[];
}

interface DataName {
    json: string;
    sheet: string;
    sql: string;
}

const dataNames: { [key: string]: DataName } = {
    parameters: { json: 'parameters', sheet: 'Paramètres', sql: 'getParameters' },
    paymentMethods: { json: 'paymentMethods', sheet: 'Paiements', sql: 'getPaymentMethods' },
    currencies: { json: 'currencies', sheet: '_Monnaies', sql: 'getCurrencies' },
    discounts: { json: 'discounts', sheet: 'Remises', sql: 'getDiscounts' },
    colors: { json: 'colors', sheet: 'Couleurs', sql: 'getColors' },
    printers: { json: 'printers', sheet: 'Imprimantes', sql: 'getPrinters' },
    products: { json: 'products', sheet: '_Produits', sql: 'getAllArticles' },
    users: { json: 'users', sheet: 'Utilisateurs', sql: 'getUsers' },
};

export const defaultParameters: Parameters = {
    shop: { name: '', email: EMAIL, address: '', zipCode: '', city: '', id: '', serial: '' },
    thanksMessage: '',
    mercurial: Mercurial.none,
    lastModified: new Date().toLocaleString(),
    closingHour: 0,
    yearStartDate: { month: 1, day: 1 }, // January 1st by default
    user: { name: '', role: Role.none },
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
        currency: '€',
        availability: true,
    },
    {
        type: 'Espèce',
        currency: '€',
        availability: true,
    },
    {
        type: 'Chèque',
        currency: '€',
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

async function _loadDataImpl(shop: string, shouldUseLocalData = false): Promise<Config | undefined> {
    // Check if DB is configured
    const hasDbConfig = await checkDbConfig();

    const id = shouldUseLocalData
        ? undefined // if the app is used locally, use the local data
        : hasDbConfig
          ? '' // if DB is configured, use DB (empty id means DB)
          : typeof shop === 'string' // if shop is a string, it means that the app is used by a customer (custom path)
            ? await fetch(`/api/spreadsheet?sheetName=index`)
                  .then(convertIndexData)
                  .then(
                      (data) =>
                          data
                              .filter(({ shop: s }) => s === shop)
                              .map(({ id }) => id)
                              .at(0) ?? undefined
                  )
                  .catch((error) => {
                      console.error(error);
                      return undefined;
                  })
            : ''; // if shop is not a string, it means that the app is used by a shop (root path)

    if (id !== undefined && !navigator.onLine) throw new AppOfflineError();

    const param = await fetchData(dataNames.parameters, id, false).then(convertParametersData);
    if (!param?.values?.length) return;

    const users = await fetchData(dataNames.users, id, false).then(convertUsersData);
    const publicKey = users?.length ? getPublicKey() : undefined;
    const foundUser = users?.length ? users.filter(({ key }) => key === publicKey).at(0) : undefined;
    const user = foundUser || { name: DEFAULT_USER, role: Role.cashier };
    if (!user || user.role === Role.none) throw new UserNotFoundError(param.values.at(1));

    // Helper function: lookup by key first, then by index
    const getParamValue = (key: string, fallbackIndex: number): string => {
        const keyIndex = param.keys.findIndex((k) => k === key);
        return keyIndex !== -1 ? param.values.at(keyIndex) ?? '' : param.values.at(fallbackIndex) ?? '';
    };

    const parameters: Parameters = {
        shop: {
            name: getParamValue('name', 0),
            address: getParamValue('address', 1),
            zipCode: getParamValue('zipCode', 2),
            city: getParamValue('city', 3),
            serial: getParamValue('serial', 4),
            id: getParamValue('id', 5),
            email: getParamValue('email', 6) || EMAIL,
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
    };

    const paymentMethods = await fetchData(dataNames.paymentMethods, id).then(convertPaymentMethodsData);
    const allCurrencies = await fetchData(dataNames.currencies, id).then(convertCurrenciesData);
    const discounts = await fetchData(dataNames.discounts, id).then(convertDiscountsData);
    const colors = await fetchData(dataNames.colors, id).then(convertColorsData);
    const printers = await fetchData(dataNames.printers, id).then(convertPrintersData);

    const data = await fetchData(dataNames.products, id).then(convertProductsData);

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
                availability: item.availability,
                order: item.order,
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
                        availability: item.availability,
                        order: item.order,
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
    };
}

// Cache for DB config check to avoid repeated API calls
let hasDbConfigCache: boolean | null = null;
let hasDbConfigPromise: Promise<boolean> | null = null;

export function clearDbConfigCache() {
    hasDbConfigCache = null;
    hasDbConfigPromise = null;
}

async function checkDbConfig(): Promise<boolean> {
    if (hasDbConfigCache !== null) return hasDbConfigCache;
    if (hasDbConfigPromise !== null) return hasDbConfigPromise;

    hasDbConfigPromise = fetch('/api/sql/getDbConfig')
        .then((r) => r.json())
        .then(({ hasDbConfig }) => {
            hasDbConfigCache = hasDbConfig;
            return hasDbConfig;
        })
        .catch(() => {
            hasDbConfigCache = false;
            return false;
        });

    return hasDbConfigPromise;
}

async function fetchData(dataName: DataName, id: string | undefined, isRaw = true) {
    // Check if DB is configured, if so use DB regardless of USE_DIGICARTE
    const hasDbConfig = await checkDbConfig();

    const url = hasDbConfig
        ? `/api/sql/${dataName.sql}`
        : id !== undefined
          ? `/api/spreadsheet?sheetName=${dataName.sheet}&id=${id}&isRaw=${isRaw.toString()}`
          : `/api/json?fileName=${dataName.json}`;

    return await fetch(url).catch((error) => console.error(error));
}

function checkData(
    data: { values?: unknown[][]; error?: { message: string } },
    dataName: string,
    minCol: number,
    maxCol = minCol,
    minRow = 1,
    maxRow = 100000
) {
    if (!data) throw new Error('data not fetched');
    if (data.error?.message) throw new Error(data.error.message);
    if (!data.values?.length) throw new MissingDataError();
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
        throw new WrongDataPatternError(
            `Format de données incorrect${context}: attendu ${minRow}-${maxRow} lignes et ${minCol}-${maxCol} colonnes, reçu ${actualRows} lignes et ${actualCols} colonnes`
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

async function convertIndexData(response: void | Response) {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
            checkData(data, 'Index', 2);

            return data.values.map((item) => {
                checkColumn(item, 'Index', 2);
                return {
                    shop: String(item.at(0)).trim(),
                    id: String(item.at(1)).trim(),
                };
            });
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
            if (!data?.values) return []; // That's fine if there is no user data

            checkData(data, 'Utilisateurs', 3);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 'Utilisateurs', 3);
                return {
                    key: String(item.at(0)).trim(),
                    name: String(item.at(1)).trim(),
                    role: (String(item.at(2)).trim() ?? Role.cashier) as Role,
                };
            });
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertParametersData(
    response: void | Response
): Promise<{ keys: (string | undefined)[]; values: (string | undefined)[] }> {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
            checkData(data, 'Paramètres', 1, 2, 6, 12);

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
    } catch (error) {
        console.error(error);
        return { keys: [], values: [] };
    }
}

async function convertPaymentMethodsData(response: void | Response): Promise<PaymentMethod[]> {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: (string | boolean)[][]; error: { message: string } }) => {
            checkData(data, 'Moyens de paiement', 4);

            return data.values
                .removeHeader()
                .filter((item) => !item.at(3))
                .map((item) => {
                    checkColumn(item, 'Moyens de paiement', 4);
                    return {
                        type: normalizedString(item.at(0)),
                        id: String(item.at(1)).trim(),
                        currency: String(item.at(2)).trim(),
                        availability: true,
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
            checkData(data, 'Devises', 6);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 'Devises', 6);
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
                            checkColumn(item, 'Produits', 4);
                            return {
                                rate: Number(item.at(0)) * 100,
                                category: normalizedString(item.at(1)),
                                label: normalizedString(item.at(2)),
                                availability: !item[3],
                                order: rowOrder,
                                prices: item.filter((_, i) => i >= 4).map((price) => Number(price)),
                                options: optionsArr[origIdx] ?? null,
                            };
                        }),
                        currencies: data.values[0].filter((_, i) => i >= 4).map((currency) => String(currency).trim()),
                    };
                }
            );
    } catch (error) {
        console.error(error);
        return;
    }
}

const normalizedString = (value: unknown) => String(value).toFirstUpperCase();
