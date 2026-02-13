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
    message = 'Format de données incorrect';
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
    shop: { name: '', email: EMAIL, address: '', zipCode: '', city: '', id: '', idType: '' },
    thanksMessage: '',
    mercurial: Mercurial.none,
    lastModified: new Date().toLocaleString(),
    user: { name: '', role: Role.none },
};

export const defaultCurrencies: Currency[] = [
    {
        label: 'Euro',
        maxValue: 999.99,
        symbol: '€',
        decimals: 2,
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

export async function loadData(shop: string, shouldUseLocalData = false): Promise<Config | undefined> {
    // TODO: use fee
    const id = shouldUseLocalData
        ? undefined // if the app is used locally, use the local data
        : typeof shop === 'string' // if shop is a string, it means that the app is used by a customer (custom path)
          ? await fetch(`./api/spreadsheet?sheetName=index`)
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
    const user = users?.length
        ? users.filter(({ key }) => key === publicKey).at(0)
        : { name: DEFAULT_USER, role: Role.cashier };
    if (!user || user.role === Role.none) throw new UserNotFoundError(param.values.at(1));

    const parameters: Parameters = {
        shop: {
            name: param.values.at(0) ?? '',
            address: param.values.at(1) ?? '',
            zipCode: param.values.at(2) ?? '',
            city: param.values.at(3) ?? '',
            id: param.values.at(4) ?? '',
            idType: param.keys.at(4)?.toUpperCase() ?? '',
            email: param.values.at(5) ?? EMAIL,
        },
        thanksMessage: param.values.at(6) ?? 'Merci de votre visite !',
        mercurial: (param.values.at(7) ?? Mercurial.none) as Mercurial,
        lastModified: param.values.at(8) ?? new Date('0').toLocaleString(),
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
        const currency = allCurrencies.find(({ label }) => label === item);
        if (!currency) throw new Error('currency not found');
        return currency;
    });

    const inventory: InventoryItem[] = [];
    data.products.forEach((item) => {
        const category = inventory.find(({ category }) => category === item.category);
        if (category) {
            category.products.push({
                label: item.label,
                prices: item.prices,
            });
        } else {
            inventory.push({
                category: item.category,
                rate: item.rate,
                products: [
                    {
                        label: item.label,
                        prices: item.prices,
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

async function fetchData(dataName: DataName, id: string | undefined, isRaw = true) {
    const url = process.env.NEXT_PUBLIC_USE_SQLDB
        ? `/api/sql/${dataName.sql}`
        : id !== undefined
          ? `./api/spreadsheet?sheetName=${dataName.sheet}&id=${id}&isRaw=${isRaw.toString()}`
          : `./api/json?fileName=${dataName.json}`;

    return await fetch(url).catch((error) => console.error(error));
}

function checkData(
    data: { values?: unknown[][]; error?: { message: string } },
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
    )
        throw new WrongDataPatternError();
}

function checkColumn(item: unknown[], minCol: number) {
    if (item.length < minCol) throw new WrongDataPatternError();
}

async function convertIndexData(response: void | Response) {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
            checkData(data, 3);

            return data.values.map((item) => {
                checkColumn(item, 3);
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

            checkData(data, 3);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 3);
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
            checkData(data, 1, 2, 9, 9);

            return {
                keys: data.values.map((item) => {
                    checkColumn(item, 1);
                    return item.at(0);
                }),
                values: data.values.map((item) => {
                    checkColumn(item, 1);
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
            checkData(data, 4);

            return data.values
                .removeHeader()
                .filter((item) => !item.at(3))
                .map((item) => {
                    checkColumn(item, 4);
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
            checkData(data, 4);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 4);
                return {
                    label: normalizedString(item.at(0)),
                    maxValue: Number(item.at(1)),
                    symbol: String(item.at(2)).trim(),
                    decimals: Number(item.at(3)),
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
            checkData(data, 2);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 2);
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
            checkData(data, 3, 3, 8, 8);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 3);
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
            checkData(data, 2, 2);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 2);
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
        return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
            checkData(data, 4, 10);

            return {
                products: data.values
                    .removeHeader()
                    .removeEmpty(1, 2)
                    .filter((item) => !item.at(3))
                    .map((item) => {
                        checkColumn(item, 4);
                        return {
                            rate: Number(item.at(0)) * 100,
                            category: normalizedString(item.at(1)),
                            label: normalizedString(item.at(2)),
                            prices: item.filter((_, i) => i >= 4).map((price) => Number(price)),
                        };
                    }),
                currencies: data.values[0].filter((_, i) => i >= 4).map((currency) => String(currency).trim()),
            };
        });
    } catch (error) {
        console.error(error);
        return;
    }
}

const normalizedString = (value: unknown) => String(value).toFirstUpperCase();
