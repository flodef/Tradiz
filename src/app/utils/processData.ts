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

export async function LoadData(isOutOfLocalHost: boolean = true) {
    if (isOutOfLocalHost && !navigator.onLine) throw new Error('The web app is offline');

    const param = await fetchData('Paramètres', 'parameters', isOutOfLocalHost, false).then(ConvertParametersData);
    if (!param?.length) return;

    const parameters = {} as Parameters;
    parameters.shopName = process.env.NEXT_PUBLIC_SHOP_NAME ?? '';
    parameters.thanksMessage = param.at(0) ?? 'Merci de votre visite !';
    parameters.mercurial = (param.at(1) ?? '') as Mercurial;
    parameters.lastModified = param.at(2) ?? new Date('0').toLocaleString();

    const paymentMethods = await fetchData('Paiement', 'paymentMethods', isOutOfLocalHost).then(
        ConvertPaymentMethodsData
    );
    if (!paymentMethods?.length) return;

    const allCurrencies = await fetchData('_Monnaie', 'currencies', isOutOfLocalHost).then(ConvertCurrenciesData);
    if (!allCurrencies?.length) return;

    const data = await fetchData('_Produits', 'products', isOutOfLocalHost).then(ConvertProductsData);
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

async function fetchData(sheetName: string, fileName: string, isOutOfLocalHost: boolean, isRaw = true) {
    return await fetch(
        isOutOfLocalHost
            ? `./api/spreadsheet?sheetName=${sheetName}&isRaw=${isRaw.toString()}`
            : `./api/json?fileName=${fileName}`
    ).catch((error) => {
        console.error(error);
    });
}

async function ConvertParametersData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
        if (!data) throw new Error('data not fetched');
        if (data.error?.message) throw new Error(data.error.message);
        if (!data.values?.length) throw new MissingDataError();
        if (data.values && (data.values.length !== 3 || data.values[0].length != 2)) throw new WrongDataPatternError();

        return data.values.map((item) => {
            if (item.length < 1) throw new WrongDataPatternError();
            return item.at(1);
        });
    });
}

async function ConvertPaymentMethodsData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: (string | boolean)[][]; error: { message: string } }) => {
        if (!data) throw new Error('data not fetched');
        if (data.error && data.error.message) throw new Error(data.error.message);
        if (!data.values?.length) throw new MissingDataError();
        if (data.values && data.values[0].length !== 3) throw new WrongDataPatternError();

        return data.values
            .filter((_, i) => i !== 0)
            .filter((item) => !Boolean(item.at(2)))
            .map((item) => {
                if (item.length < 3) throw new WrongDataPatternError();
                return {
                    method: String(item.at(0)).trim() ?? '',
                    address: String(item.at(1)).trim() ?? '',
                };
            });
    });
}

async function ConvertCurrenciesData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
        if (!data) throw new Error('data not fetched');
        if (data.error && data.error.message) throw new Error(data.error.message);
        if (!data.values?.length) throw new MissingDataError();
        if (data.values && data.values[0].length !== 5) throw new WrongDataPatternError();

        return data.values
            .filter((_, i) => i !== 0)
            .map((item) => {
                if (item.length < 5) throw new WrongDataPatternError();
                return {
                    label: String(item.at(0)).trim() ?? '',
                    maxValue: Number(item.at(1)),
                    symbol: String(item.at(2)).trim() ?? '',
                    maxDecimals: Number(item.at(3)),
                    isOutOfComptability: Boolean(item.at(4)),
                };
            });
    });
}

async function ConvertProductsData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
        if (!data) throw new Error('data not fetched');
        if (data.error && data.error.message) throw new Error(data.error.message);
        if (!data.values?.length) throw new MissingDataError();
        if (data.values && data.values[0].length < 4) throw new WrongDataPatternError();

        return {
            products: data.values
                .filter((_, i) => i !== 0)
                .map((item) => {
                    if (item.length < 3) throw new WrongDataPatternError();

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
