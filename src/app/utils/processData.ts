import { Parameters } from '../contexts/ConfigProvider';
import { InventoryItem, Mercurial } from '../hooks/useConfig';

class MissingDataError extends Error {
    name = 'MissingDataError';
    message = 'missing data';
}

class WrongDataPatternError extends Error {
    name = 'WrongDataPatternError';
    message = 'wrong data pattern';
}

export async function loadData(user: string, isOutOfLocalHost = true) {
    if (isOutOfLocalHost && !navigator.onLine) throw new Error('The web app is offline');

    const id = await fetch(`./api/spreadsheet?sheetName=index`)
        .catch((error) => {
            console.error(error);
        })
        .then(convertIndexData)
        .then((data) =>
            data
                ?.filter(({ user: u }) => u === user)
                .map(({ id }) => id)
                .at(0)
        );

    const param = await fetchData('Paramètres', 'parameters', id, false).then(convertParametersData);
    if (!param?.length) return;

    const parameters = {} as Parameters;
    parameters.shopName = param.at(0) ?? '';
    parameters.thanksMessage = param.at(1) ?? 'Merci de votre visite !';
    parameters.mercurial = (param.at(2) ?? Object.values(Mercurial).at(0)) as Mercurial;
    parameters.lastModified = param.at(3) ?? new Date('0').toLocaleString();

    const paymentMethods = await fetchData('Paiement', 'paymentMethods', id).then(convertPaymentMethodsData);
    if (!paymentMethods?.length) return;

    const allCurrencies = await fetchData('_Monnaie', 'currencies', id).then(convertCurrenciesData);
    if (!allCurrencies?.length) return;

    const data = await fetchData('_Produits', 'products', id).then(convertProductsData);
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

async function fetchData(sheetName: string, fileName: string, id: string | undefined, isRaw = true) {
    return await fetch(
        id
            ? `./api/spreadsheet?sheetName=${sheetName}&id=${id}&isRaw=${isRaw.toString()}`
            : `./api/json?fileName=${fileName}`
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
                user: item.at(0),
                id: item.at(1),
            };
        });
    });
}

async function convertParametersData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
        checkData(data, 2, 2, 4, 4);

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
                    method: String(item.at(0)).trim() ?? '',
                    address: String(item.at(1)).trim() ?? '',
                };
            });
    });
}

async function convertCurrenciesData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
        checkData(data, 5);

        return data.values
            .filter((_, i) => i !== 0)
            .map((item) => {
                checkColumn(item, 5);
                return {
                    label: String(item.at(0)).trim() ?? '',
                    maxValue: Number(item.at(1)),
                    symbol: String(item.at(2)).trim() ?? '',
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
                .map((item) => {
                    checkColumn(item, 3);
                    return {
                        rate: (Number(item.at(0)) ?? 0) * 100,
                        category: String(item.at(1)).trim() ?? '',
                        label: String(item.at(2)).trim() ?? '',
                        prices: item.filter((_, i) => i >= 3).map((price) => Number(price) ?? 0),
                    };
                }),
            currencies: data.values[0].filter((_, i) => i >= 3),
        };
    });
}
