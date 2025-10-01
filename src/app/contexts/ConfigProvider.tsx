'use client';

import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
    Color,
    ConfigContext,
    Currency,
    Discount,
    InventoryItem,
    Mercurial,
    PaymentMethod,
    Printer,
    State,
    User,
} from '../hooks/useConfig';
import { Product, useData } from '../hooks/useData';
import { useWindowParam } from '../hooks/useWindowParam';
import { IS_DEV, LOCAL_PRINTER_KEYWORD, PRINT_KEYWORD, SEPARATOR } from '../utils/constants';
import { useLocalStorage } from '../utils/localStorage';
import {
    UserNotFoundError,
    defaultCurrencies,
    defaultParameters,
    defaultPaymentMethods,
    loadData,
} from '../utils/processData';

export interface Shop {
    name: string;
    address: string;
    zipCode: string;
    city: string;
    id: string;
    email: string;
}

export interface Parameters {
    shop: Shop;
    thanksMessage: string;
    mercurial: Mercurial;
    lastModified: string;
    user: User;
    error?: string;
}

export interface Config {
    parameters: Parameters;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
    discounts: Discount[];
    colors: Color[];
    printers: Printer[];
}

export interface ConfigProviderProps {
    children: ReactNode;
    shop: string;
    orderId?: string;
}

export const ConfigProvider: FC<ConfigProviderProps> = ({ children, shop, orderId }) => {
    const { addProduct } = useData();
    const { isDemo } = useWindowParam();

    const [state, setState] = useState(State.init);
    const [config, setConfig] = useLocalStorage<Config | undefined>('Config', undefined);
    const [parameters, setParameters] = useState<Parameters>(defaultParameters);
    const [currencyIndex, setCurrencyIndex] = useState(0);
    const [currencies, setCurrencies] = useState<Currency[]>(defaultCurrencies);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [discounts, setDiscounts] = useState<Discount[]>([]);
    const [colors, setColors] = useState<Color[]>([]);
    const [printers, setPrinters] = useState<Printer[]>([]);

    const isStateReady = useMemo(() => state === State.preloaded || state === State.loaded, [state]);

    const setCurrency = useCallback(
        (label: string) => {
            const index = currencies.findIndex(({ label: l }) => l === label);
            if (index !== -1) {
                setCurrencyIndex(index);
            }
        },
        [currencies]
    );

    const getPrintersNames = useCallback(() => {
        const printersNames = printers.filter(({ label: name }) => name !== LOCAL_PRINTER_KEYWORD);
        if (!printersNames.length) return [];

        return printersNames.length === 1
            ? [PRINT_KEYWORD]
            : printersNames.map(({ label: name }) => PRINT_KEYWORD + SEPARATOR + name);
    }, [printers]);
    const getPrinterAddresses = useCallback(
        (name?: string) => {
            const printerName = name?.split(SEPARATOR)[1];
            const printer = (
                printerName
                    ? [
                          printers.find(({ label: n }) => n === printerName),
                          printers.find(({ label: n }) => n === LOCAL_PRINTER_KEYWORD),
                      ]
                    : printers
            ).filter(Boolean) as Printer[]; // If no printer name is provided, return all printers
            if (!printer.length) return [];

            return printer.map(({ ipAddress: address }) => address);
        },
        [printers]
    );

    const loadConfig = useCallback((data: Config | undefined) => {
        if (!data) return;

        localStorage.removeItem('Config');

        setParameters(data.parameters);
        setCurrencies(data.currencies);
        setPaymentMethods(data.paymentMethods);
        setInventory(data.inventory);
        setDiscounts(data.discounts);
        setColors(data.colors);
        setPrinters(data.printers);

        setState(State.preloaded);
    }, []);

    const storeData = useCallback(
        (data: Config | undefined) => {
            if (
                !(
                    data?.currencies.length &&
                    data?.paymentMethods.length &&
                    data?.inventory.length &&
                    data?.discounts.length &&
                    data?.colors.length &&
                    data?.parameters
                )
            )
                throw new Error('Empty config data');

            setConfig(data);
            loadConfig(data);

            setState(State.loaded);
        },
        [setConfig, loadConfig]
    );

    useEffect(() => {
        if (!colors?.length) return;

        document.documentElement.style.setProperty('--writing-light-color', colors[0].light);
        document.documentElement.style.setProperty('--main-from-light-color', colors[1].light);
        document.documentElement.style.setProperty('--main-to-light-color', colors[2].light);
        document.documentElement.style.setProperty('--popup-light-color', colors[3].light);
        document.documentElement.style.setProperty('--active-light-color', colors[4].light);
        document.documentElement.style.setProperty('--secondary-light-color', colors[5].light);
        document.documentElement.style.setProperty('--secondary-active-light-color', colors[6].light);

        document.documentElement.style.setProperty('--writing-dark-color', colors[0].dark);
        document.documentElement.style.setProperty('--main-from-dark-color', colors[1].dark);
        document.documentElement.style.setProperty('--main-to-dark-color', colors[2].dark);
        document.documentElement.style.setProperty('--popup-dark-color', colors[3].dark);
        document.documentElement.style.setProperty('--active-dark-color', colors[4].dark);
        document.documentElement.style.setProperty('--secondary-dark-color', colors[5].dark);
        document.documentElement.style.setProperty('--secondary-active-dark-color', colors[6].dark);
    }, [colors]);

    useEffect(() => {
        if (state === State.init) {
            console.log('orderId', orderId);
            fetch(`/api/mariadb/getOrderItems?orderId=${orderId}`)
                .then((response) => response.json())
                .then((items: Product[]) => items.forEach(addProduct));

            setState(State.loading);

            loadConfig(config);

            loadData(shop, IS_DEV || isDemo)
                .then(storeData)
                .catch((error) => {
                    console.error(error);

                    parameters.error = error.message;
                    if (error instanceof UserNotFoundError) {
                        parameters.shop.email = String(error.cause);
                        setState(State.unidentified);
                    } else {
                        setState(State.error);
                    }
                });
        }
    }, [state, config, storeData, loadConfig, shop, parameters, isDemo, addProduct, orderId]);

    return (
        <ConfigContext.Provider
            value={{
                state,
                setState,
                isStateReady,
                parameters,
                currencyIndex,
                setCurrency,
                currencies,
                paymentMethods,
                inventory,
                discounts,
                colors,
                getPrintersNames,
                getPrinterAddresses,
                orderId,
            }}
        >
            {children}
        </ConfigContext.Provider>
    );
};
