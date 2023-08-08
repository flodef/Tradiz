'use client';

import { FC, ReactNode, useCallback, useEffect, useState } from 'react';
import { ConfigContext, Currency, InventoryItem, Mercurial, PaymentMethod, State } from '../hooks/useConfig';
import { useLocalStorage } from '../utils/localStorage';
import { LoadData } from '../utils/processData';

export interface ConfigProviderProps {
    children: ReactNode;
}

export interface Parameters {
    shopName: string;
    thanksMessage: string;
    mercurial: Mercurial;
    lastModified: string;
}

interface Config {
    parameters: Parameters;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
}

export const ConfigProvider: FC<ConfigProviderProps> = ({ children }) => {
    const [state, setState] = useState(State.init);
    const [config, setConfig] = useLocalStorage<Config | undefined>('Parameters', undefined);
    const [shopName, setShopName] = useState('');
    const [thanksMessage, setThanksMessage] = useState('');
    const [mercurial, setMercurial] = useState(Mercurial.none);
    const [lastModified, setLastModified] = useState(new Date().toLocaleString());
    const [currencyIndex, setCurrencyIndex] = useState(0);
    const [currencies, setCurrencies] = useState<Currency[]>([
        {
            label: 'Euro',
            maxValue: 999.99,
            symbol: '€',
            maxDecimals: 2,
        },
    ]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
        {
            method: 'CB',
        },
        {
            method: 'Espèces',
        },
        {
            method: 'Chèque',
        },
    ]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);

    const setCurrency = useCallback(
        (currency: string) => {
            const index = currencies.findIndex(({ label }) => label === currency);
            if (index !== -1) {
                setCurrencyIndex(index);
            }
        },
        [currencies]
    );

    const updateConfig = useCallback((data: Config) => {
        setShopName(data.parameters.shopName);
        setThanksMessage(data.parameters.thanksMessage);
        setMercurial(data.parameters.mercurial);
        setLastModified(data.parameters.lastModified);
        setCurrencies(data.currencies);
        setPaymentMethods(data.paymentMethods);
        setInventory(data.inventory);
    }, []);

    const storeData = useCallback(
        (data: Config | undefined) => {
            if (data?.currencies.length && data?.paymentMethods.length && data?.inventory.length && data?.parameters) {
                setConfig(data);
                updateConfig(data);
                return true;
            } else {
                return false;
            }
        },
        [setConfig, updateConfig]
    );

    useEffect(() => {
        if (state === State.init) {
            setState(State.loading);
            LoadData()
                .then((data) => {
                    if (!storeData(data)) throw new Error('Empty config data');

                    setState(State.done);
                })
                .catch((error) => {
                    console.error(error);

                    if (config) {
                        updateConfig(config);
                    } else {
                        LoadData(false).then((data) => {
                            if (!storeData(data)) {
                                setState(State.fatal);
                                return;
                            }
                        });
                    }
                    setState(State.error);
                });
        }
    }, [state, config, storeData, updateConfig]);

    return (
        <ConfigContext.Provider
            value={{
                state,
                setState,
                shopName,
                thanksMessage,
                mercurial,
                lastModified,
                currencyIndex,
                setCurrency,
                currencies,
                paymentMethods,
                inventory,
            }}
        >
            {children}
        </ConfigContext.Provider>
    );
};
