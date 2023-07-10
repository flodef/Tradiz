import { InventoryItem } from '../hooks/useConfig';

export async function LoadData(isOnline = true) {
    if (isOnline && !navigator?.onLine) throw new Error('The web app is offline');

    const parameters = await fetch(
        isOnline ? './api/spreadsheet?sheetName=Paramètres&isRaw=false' : './api/json?fileName=parameters'
    )
        .then(ConvertParametersData)
        .catch((error) => {
            console.error(error);
        });

    if (!parameters?.length) return;

    let param = {} as {
        maxValue: number;
        maxDecimals: number;
        currency: string;
        paymentMethods: string[];
        lastModified: string;
    };

    const param0 = parameters.at(0);
    const max = (
        param0?.includes('.') && (param0.includes(',') || param0.includes(' ')) ? param0.replace(/,| /g, '') : param0
    )?.replace(/[^\d.-]/g, '');

    if (max && param0 && parseFloat(max)) {
        param.maxValue = parseFloat(max);
        param.maxDecimals = max.indexOf('.') == -1 ? 0 : max.length - max.indexOf('.') - 1;
        param.currency = /\D/.test(param0.slice(-1))
            ? param0.slice(-1)
            : /\D/.test(param0.slice(0, 1))
            ? param0.slice(0, 1)
            : '';
    }

    const param1 = parameters.at(1)?.split(',');
    param.paymentMethods = param1?.length && param1.every((item) => !/\d/.test(item)) ? param1 : [];

    param.lastModified = parameters.at(2) ?? '0';

    const products = await fetch(
        isOnline ? './api/spreadsheet?sheetName=Produits&isRaw=true' : './api/json?fileName=products'
    )
        .then(ConvertProductsData)
        .catch((error) => {
            console.error(error);
        });

    if (!products?.length) return;

    let inventory = [] as InventoryItem[];
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
        parameters: param,
        inventory: inventory,
    };
}

async function ConvertParametersData(response: Response) {
    return await response.json().then((data: { values: string[][]; error: { message: string } }) => {
        if (!data) throw new Error('data not fetched');
        if (data.error?.message) throw new Error(data.error.message);
        if (data.values?.length === 0) throw new Error('missing data pattern');

        return data.values.map((item) => {
            return item[1];
        });
    });
}

async function ConvertProductsData(response: Response) {
    return await response.json().then((data: { values: (string | number)[][]; error: { message: string } }) => {
        if (!data) throw new Error('data not fetched');
        if (data.error && data.error.message) throw new Error(data.error.message);
        if (data.values?.length === 0) throw new Error('missing data pattern');
        const labels = data.values[0];
        return data.values
            .filter((item, i) => i !== 0)
            .map((item) => {
                return {
                    category: item[0]?.toString().trim(),
                    rate: item[1]?.toString().fromCurrency() * 100,
                    label: item[2]?.toString().trim(),
                    price: item[3]?.toString().fromCurrency() ?? 0,
                };
            });
    });
}
