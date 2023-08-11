'use client';

import { FC, ReactNode, useCallback, useEffect, useState } from 'react';
import { ConfigContext, Currency, InventoryItem, Mercurial, PaymentMethod, State } from '../hooks/useConfig';
import { useLocalStorage } from '../utils/localStorage';
import { UserNotFoundError, checkUser, loadData } from '../utils/processData';

export interface ConfigProviderProps {
    children: ReactNode;
    shop: string;
}

export interface Parameters {
    shopName: string;
    shopEmail: string;
    thanksMessage: string;
    mercurial: Mercurial;
    lastModified: string;
}

export interface User {
    key: string;
    name: string;
    role: string;
}

interface Config {
    parameters: Parameters;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
    users: User[] | undefined;
}

export const ConfigProvider: FC<ConfigProviderProps> = ({ children, shop }) => {
    const [state, setState] = useState(State.init);
    const [config, setConfig] = useLocalStorage<Config | undefined>('Parameters', undefined);
    const [shopName, setShopName] = useState('');
    const [shopEmail, setShopEmail] = useState('');
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
    const [users, setUsers] = useState<User[] | undefined>([]); // TODO find what to do with this

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
        setShopEmail(data.parameters.shopEmail);
        setThanksMessage(data.parameters.thanksMessage);
        setMercurial(data.parameters.mercurial);
        setLastModified(data.parameters.lastModified);
        setCurrencies(data.currencies);
        setPaymentMethods(data.paymentMethods);
        setInventory(data.inventory);
        setUsers(data.users);
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

            loadData(shop)
                .then((data) => {
                    if (!storeData(data)) throw new Error('Empty config data');

                    setState(State.done);
                })
                .catch((error) => {
                    console.error(error);

                    if (config) {
                        updateConfig(config);
                        setState(checkUser(config.users) ? State.error : State.unidentified);
                    } else {
                        loadData(shop, false)
                            .then((data) => {
                                setState(storeData(data) ? State.error : State.fatal);
                            })
                            .catch((error) => {
                                console.error(error);
                                setState(error instanceof UserNotFoundError ? State.unidentified : State.fatal);
                            });
                    }
                });
        }
    }, [state, config, storeData, updateConfig, shop]);

    return (
        <ConfigContext.Provider
            value={{
                state,
                setState,
                shopEmail,
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
