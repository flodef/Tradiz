import { Keypair } from '@solana/web3.js';
import { Config, Parameters } from '../contexts/ConfigProvider';
import { Currency, InventoryItem, Mercurial, PaymentMethod, Role } from '../hooks/useConfig';
import { EMAIL } from './constants';

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

interface DataName {
    json: string;
    sheet: string;
}

const dataNames: { [key: string]: DataName } = {
    parameters: { json: 'parameters', sheet: 'Paramètres' },
    paymentMethods: { json: 'paymentMethods', sheet: 'Paiements' },
    currencies: { json: 'currencies', sheet: '_Monnaies' },
    discounts: { json: 'discounts', sheet: 'Remises' },
    colors: { json: 'colors', sheet: 'Couleurs' },
    products: { json: 'products', sheet: '_Produits' },
    users: { json: 'users', sheet: 'Utilisateurs' },
};

export const defaultParameters: Parameters = {
    shopName: '',
    shopEmail: EMAIL,
    thanksMessage: '',
    mercurial: Mercurial.none,
    printerIPAddress: '',
    lastModified: new Date().toLocaleString(),
    user: { name: '', role: Role.none },
};

export const defaultCurrencies: Currency[] = [
    {
        label: 'Euro',
        maxValue: 999.99,
        symbol: '€',
        maxDecimals: 2,
    },
];
export const defaultPaymentMethods: PaymentMethod[] = [
    {
        method: 'CB',
        currency: '€',
    },
    {
        method: 'Espèces',
        currency: '€',
    },
    {
        method: 'Chèque',
        currency: '€',
    },
];

export function getPublicKey() {
    let publicKey = localStorage.getItem('PublicKey');
    if (!publicKey) {
        publicKey = Keypair.generate().publicKey.toString();
        localStorage.setItem('PublicKey', publicKey);
    }
    return publicKey;
}

const emptyShop = { id: undefined, fee: 0 };

export async function loadData(shop: string, shouldUseLocalData = false): Promise<Config | undefined> {
    // TODO: use fee
    const { id, fee } = shouldUseLocalData
        ? emptyShop // if the app is used locally, use the local data
        : typeof shop === 'string' // if shop is a string, it means that the app is used by a customer (custom path)
          ? await fetch(`./api/spreadsheet?sheetName=index`)
                .then(convertIndexData)
                .then(
                    (data) =>
                        data
                            .filter(({ shop: s }) => s === shop)
                            .map(({ id, fee }) => ({ id, fee }))
                            .at(0) ?? emptyShop
                )
                .catch((error) => {
                    console.error(error);
                    return emptyShop;
                })
          : { id: '', fee: 0 }; // if shop is not a string, it means that the app is used by a shop (root path)

    if (id !== undefined && !navigator.onLine) throw new AppOfflineError();

    const param = await fetchData(dataNames.parameters, id, false).then(convertParametersData);
    if (!param?.length) return;

    const users = await fetchData(dataNames.users, id, false).then(convertUsersData);
    const publicKey = users?.length ? getPublicKey() : undefined;
    const user = users?.length ? users.filter(({ key }) => key === publicKey).at(0) : { name: '', role: Role.cashier };
    if (!user || user.role === Role.none) throw new UserNotFoundError(param.at(1));

    const parameters: Parameters = {
        shopName: param.at(0) ?? '',
        shopEmail: param.at(1) ?? EMAIL,
        thanksMessage: param.at(2) ?? 'Merci de votre visite !',
        mercurial: (param.at(3) ?? Mercurial.none) as Mercurial,
        printerIPAddress: param.at(4) ?? '',
        lastModified: param.at(5) ?? new Date('0').toLocaleString(),
        user: user,
    };

    const paymentMethods = await fetchData(dataNames.paymentMethods, id).then(convertPaymentMethodsData);
    const allCurrencies = await fetchData(dataNames.currencies, id).then(convertCurrenciesData);
    const discounts = await fetchData(dataNames.discounts, id).then(convertDiscountsData);
    const colors = await fetchData(dataNames.colors, id).then(convertColorsData);

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
    };
}

async function fetchData(dataName: DataName, id: string | undefined, isRaw = true) {
    return await fetch(
        id !== undefined
            ? `./api/spreadsheet?sheetName=${dataName.sheet}&id=${id}&isRaw=${isRaw.toString()}`
            : `./api/json?fileName=${dataName.json}`
    ).catch((error) => {
        console.error(error);
    });
}

function checkData(data: any, minCol: number, maxCol = minCol, minRow = 1, maxRow = 100000) {
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

function checkColumn(item: any[], minCol: number) {
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
                    fee: Number(item.at(2)),
                };
            });
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertUsersData(response: void | Response) {
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

async function convertParametersData(response: void | Response) {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
            checkData(data, 1, 2, 6, 6);

            return data.values.map((item) => {
                checkColumn(item, 1);
                return item.at(1);
            });
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertPaymentMethodsData(response: void | Response) {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: (string | boolean)[][]; error: { message: string } }) => {
            checkData(data, 4);

            return data.values
                .removeHeader()
                .filter((item) => !Boolean(item.at(3)))
                .map((item) => {
                    checkColumn(item, 4);
                    return {
                        method: normalizedString(item.at(0)),
                        address: String(item.at(1)).trim(),
                        currency: String(item.at(2)).trim(),
                    };
                });
        });
    } catch (error) {
        console.error(error);
        return defaultPaymentMethods;
    }
}

async function convertCurrenciesData(response: void | Response) {
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
                    maxDecimals: Number(item.at(3)),
                };
            });
        });
    } catch (error) {
        console.error(error);
        return defaultCurrencies;
    }
}

async function convertDiscountsData(response: void | Response) {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
            checkData(data, 2);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 2);
                return {
                    value: Number(item.at(0)),
                    unit: String(item.at(1)).trim(),
                };
            });
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function convertColorsData(response: void | Response) {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
            checkData(data, 3, 3, 8, 8);

            return data.values.removeHeader().map((item) => {
                checkColumn(item, 3);
                return {
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

async function convertProductsData(response: void | Response) {
    try {
        if (typeof response === 'undefined') throw new EmptyDataError();
        return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
            checkData(data, 4, 10);

            return {
                products: data.values
                    .removeHeader()
                    .removeEmpty(1, 2)
                    .filter((item) => !Boolean(item.at(3)))
                    .map((item) => {
                        checkColumn(item, 4);
                        return {
                            rate: (Number(item.at(0)) ?? 0) * 100,
                            category: normalizedString(item.at(1)),
                            label: normalizedString(item.at(2)),
                            prices: item.filter((_, i) => i >= 4).map((price) => Number(price) ?? 0),
                        };
                    }),
                currencies: data.values[0].filter((_, i) => i >= 4),
            };
        });
    } catch (error) {
        console.error(error);
        return;
    }
}

function normalizedString(value: any) {
    const label = String(value).trim();
    return label.charAt(0).toUpperCase() + label.slice(1);
}
