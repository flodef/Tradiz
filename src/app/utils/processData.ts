import { Keypair } from '@solana/web3.js';
import { Parameters } from '../contexts/ConfigProvider';
import { InventoryItem, Mercurial, Role } from '../hooks/useConfig';
import { EMAIL } from './constants';

class MissingDataError extends Error {
    name = 'MissingDataError';
    message = 'missing data';
}

class WrongDataPatternError extends Error {
    name = 'WrongDataPatternError';
    message = 'wrong data pattern';
}

export class UserNotFoundError extends Error {
    name = 'UserNotFoundError';
    message = 'user not found';
    constructor(email: string | undefined) {
        super(`user not found: ${email}`, { cause: email });
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
    products: { json: 'products', sheet: '_Produits' },
    users: { json: 'users', sheet: 'Utilisateurs' },
};

export function getPublicKey() {
    let publicKey = localStorage.getItem('PublicKey');
    if (!publicKey) {
        publicKey = Keypair.generate().publicKey.toString();
        localStorage.setItem('PublicKey', publicKey);
    }
    return publicKey;
}

export async function loadData(shop: string, isOutOfLocalHost = true) {
    if (isOutOfLocalHost && !navigator.onLine) throw new Error('The web app is offline');

    const id = isOutOfLocalHost
        ? typeof shop === 'string' // if shop is a string, it means that the app is used by a customer (custom path)
            ? await fetch(`./api/spreadsheet?sheetName=index`)
                  .catch((error) => {
                      console.error(error);
                  })
                  .then(convertIndexData)
                  .then((data) =>
                      data
                          ?.filter(({ shop: s }) => s === shop)
                          .map(({ id }) => id)
                          .at(0)
                  )
            : '' // if shop is not a string, it means that the app is used by a shop (root path)
        : undefined;

    const param = await fetchData(dataNames.parameters, id, false).then(convertParametersData);
    if (!param?.length) return;

    const users = await fetchData(dataNames.users, id, false)
        .then(convertUsersData)
        .catch(() => undefined); // That's fine if there is no user data
    const publicKey = users?.length ? getPublicKey() : undefined;
    const user = users?.length ? users.filter(({ key }) => key === publicKey).at(0) : { name: '', role: Role.cashier };
    if (!user || user.role === Role.none) throw new UserNotFoundError(param.at(1));

    const parameters: Parameters = {
        shopName: param.at(0) ?? '',
        shopEmail: param.at(1) ?? EMAIL,
        thanksMessage: param.at(2) ?? 'Merci de votre visite !',
        mercurial: (param.at(3) ?? Mercurial.none) as Mercurial,
        lastModified: param.at(4) ?? new Date('0').toLocaleString(),
        user: user,
    };

    const paymentMethods = await fetchData(dataNames.paymentMethods, id).then(convertPaymentMethodsData);
    if (!paymentMethods?.length) return;

    const allCurrencies = await fetchData(dataNames.currencies, id).then(convertCurrenciesData);
    if (!allCurrencies?.length) return;

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
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
        checkData(data, 2);

        return data.values.map((item) => {
            checkColumn(item, 2);
            return {
                shop: item.at(0),
                id: item.at(1),
            };
        });
    });
}

async function convertUsersData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
        checkData(data, 3);

        return data.values
            .filter((_, i) => i !== 0)
            .map((item) => {
                checkColumn(item, 3);
                return {
                    key: String(item.at(0)).trim(),
                    name: String(item.at(1)).trim(),
                    role: (String(item.at(2)).trim() ?? Role.cashier) as Role,
                };
            });
    });
}

async function convertParametersData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
        checkData(data, 2, 2, 5, 5);

        return data.values.map((item) => {
            checkColumn(item, 2);
            return item.at(1);
        });
    });
}

async function convertPaymentMethodsData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: (string | boolean)[][]; error: { message: string } }) => {
        checkData(data, 3);

        return data.values
            .filter((_, i) => i !== 0)
            .filter((item) => !Boolean(item.at(2)))
            .map((item) => {
                checkColumn(item, 3);
                return {
                    method: String(item.at(0)).trim(),
                    address: String(item.at(1)).trim(),
                };
            });
    });
}

async function convertCurrenciesData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
        checkData(data, 4);

        return data.values
            .filter((_, i) => i !== 0)
            .map((item) => {
                checkColumn(item, 4);
                return {
                    label: String(item.at(0)).trim(),
                    maxValue: Number(item.at(1)),
                    symbol: String(item.at(2)).trim(),
                    maxDecimals: Number(item.at(3)),
                };
            });
    });
}

async function convertProductsData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
        checkData(data, 4, 10);

        return {
            products: data.values
                .filter((_, i) => i !== 0)
                .filter((item) => !Boolean(item.at(2)))
                .map((item) => {
                    checkColumn(item, 4);
                    return {
                        rate: (Number(item.at(0)) ?? 0) * 100,
                        category: String(item.at(1)).trim(),
                        label: String(item.at(3)).trim(),
                        prices: item.filter((_, i) => i >= 4).map((price) => Number(price) ?? 0),
                    };
                }),
            currencies: data.values[0].filter((_, i) => i >= 4),
        };
    });
}
