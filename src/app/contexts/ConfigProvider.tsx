'use client';

import {
    Color,
    Currency,
    Discount,
    InventoryItem,
    Mercurial,
    PaymentMethod,
    Printer,
    State,
    User,
} from '@/app/utils/interfaces';
import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ConfigContext } from '../hooks/useConfig';
import { useWindowParam } from '../hooks/useWindowParam';
import { IS_DEV, LOCAL_PRINTER_KEYWORD, PRINT_KEYWORD, SEPARATOR, USE_DIGICARTE } from '../utils/constants';
import { useLocalStorage } from '../utils/localStorage';
import {
    UserNotFoundError,
    defaultCurrencies,
    defaultParameters,
    defaultPaymentMethods,
    loadData,
} from '../utils/processData';
import { OperationMode } from '../hooks/useConfig';

export interface Shop {
    name: string;
    address: string;
    zipCode: string;
    city: string;
    serial: string;
    email: string;
    id: string;
}

export interface Parameters {
    shop: Shop;
    thanksMessage: string;
    mercurial: Mercurial;
    lastModified: string;
    closingHour: number;
    yearStartDate?: { month: number; day: number }; // Optional, defaults to { month: 1, day: 1 } (January 1st)
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
}

export const ConfigProvider: FC<ConfigProviderProps> = ({ children, shop }) => {
    const { isDemo } = useWindowParam();

    const [state, setState] = useState(State.init);
    const [modeFonctionnement, setModeFonctionnement] = useState<OperationMode>(USE_DIGICARTE ? 'restaurant' : 'lite');
    const [isFastFood, setIsFastFood] = useState(!USE_DIGICARTE);
    const [isKitchenViewEnabled, setIsKitchenViewEnabled] = useState(true);
    const [isGrafanaAccessEnabled, setIsGrafanaAccessEnabled] = useState(true);

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

    useEffect(() => {
        if (!USE_DIGICARTE) return;

        type EtabConfigResponse = {
            mode_fonctionnement?: OperationMode;
            kitchen_view_enabled?: boolean;
            grafana_access_enabled?: boolean;
        };

        fetch('/api/sql/getEtabConfig')
            .then((r) => r.json())
            .then((data: EtabConfigResponse) => {
                const mode =
                    data?.mode_fonctionnement === 'fastfood'
                        ? 'fastfood'
                        : data?.mode_fonctionnement === 'lite'
                          ? 'lite'
                          : 'restaurant';
                setModeFonctionnement(mode);
                setIsFastFood(mode === 'fastfood' || mode === 'lite');
                setIsKitchenViewEnabled(data?.kitchen_view_enabled ?? true);
                setIsGrafanaAccessEnabled(data?.grafana_access_enabled ?? true);
            })
            .catch(() => {
                setModeFonctionnement('restaurant');
                setIsFastFood(false);
                setIsKitchenViewEnabled(true);
                setIsGrafanaAccessEnabled(true);
            });
    }, []);

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

        document.documentElement.setAttribute('data-theme-ready', '1');
    }, [colors]);

    useEffect(() => {
        if (state !== State.init) return;

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
    }, [state, config, storeData, loadConfig, shop, parameters, isDemo]);

    return (
        <ConfigContext.Provider
            value={{
                state,
                setState,
                isStateReady,
                modeFonctionnement,
                isFastFood,
                isKitchenViewEnabled,
                isGrafanaAccessEnabled,
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
            }}
        >
            {children}
        </ConfigContext.Provider>
    );
};
