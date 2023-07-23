import { Parameters } from '../contexts/ConfigProvider';
import { InventoryItem } from '../hooks/useConfig';

export async function LoadData(isOutOfLocalHost: boolean = true) {
    if (isOutOfLocalHost && !navigator?.onLine) throw new Error('The web app is offline');

    const param = await fetchData('Paramètres', 'parameters', isOutOfLocalHost).then(ConvertParametersData);
    if (!param?.length) return;

    const parameters = {} as Parameters;
    parameters.shopName = param.at(0) ?? '';
    parameters.thanksMessage = param.at(1) ?? '';

    const param2 = param.at(2);
    const max = (
        param2?.includes('.') && (param2.includes(',') || param2.includes(' ')) ? param2.replace(/,| /g, '') : param2
    )?.replace(/[^\d.-]/g, '');

    if (max && param2 && parseFloat(max)) {
        parameters.maxValue = parseFloat(max);
        parameters.maxDecimals = max.indexOf('.') == -1 ? 0 : max.length - max.indexOf('.') - 1;
        parameters.currency = /\D/.test(param2.slice(-1))
            ? param2.slice(-1)
            : /\D/.test(param2.slice(0, 1))
            ? param2.slice(0, 1)
            : '';
    }
    parameters.lastModified = param.at(3) ?? '0';

    const paymentMethods = await fetchData('Paiement', 'paymentMethods', isOutOfLocalHost).then(
        ConvertPaymentMethodsData
    );
    if (!paymentMethods?.length) return;

    const products = await fetchData('Produits', 'products', isOutOfLocalHost, true).then(ConvertProductsData);
    if (!products?.length) return;

    const inventory: InventoryItem[] = [];
    products.forEach((item) => {
        const category = inventory.find(({ category }) => category === item.category);
        if (category) {
            category.products.push({
                label: item.label,
                price: item.price,
            });
        } else {
            inventory.push({
                category: item.category,
                rate: item.rate,
                products: [
                    {
                        label: item.label,
                        price: item.price,
                    },
                ],
            });
        }
    });

    return {
        parameters,
        inventory,
        paymentMethods,
    };
}

async function fetchData(sheetName: string, fileName: string, isOutOfLocalHost: boolean, isRaw = false) {
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
        if (!data.values?.length) throw new Error('missing data pattern');

        return data.values.map((item) => {
            return item.at(1);
        });
    });
}

async function ConvertPaymentMethodsData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
        if (!data) throw new Error('data not fetched');
        if (data.error && data.error.message) throw new Error(data.error.message);
        if (!data.values?.length) throw new Error('missing data pattern');

        return data.values
            .filter((item, i) => i !== 0)
            .map((item) => {
                return {
                    method: item.at(0)?.trim() ?? '',
                    reference: item.at(1)?.trim() ?? '',
                };
            });
    });
}

async function ConvertProductsData(response: void | Response) {
    if (typeof response === 'undefined') return;
    return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
        if (!data) throw new Error('data not fetched');
        if (data.error && data.error.message) throw new Error(data.error.message);
        if (!data.values?.length) throw new Error('missing data pattern');

        return data.values
            .filter((item, i) => i !== 0)
            .map((item) => {
                return {
                    category: item.at(0)?.toString().trim() ?? '',
                    rate: item.at(1)?.toString().fromCurrency() ?? 0 * 100,
                    label: item.at(2)?.toString().trim() ?? '',
                    price: item.at(3)?.toString().fromCurrency() ?? 0,
                };
            });
    });
}
