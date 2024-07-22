'use client';

import { FC, ReactNode, useCallback, useEffect, useState } from 'react';
import {
    ConfigContext,
    Currency,
    InventoryItem,
    Mercurial,
    PaymentMethod,
    Role,
    State,
    User,
} from '../hooks/useConfig';
import { EMAIL } from '../utils/constants';
import { useLocalStorage } from '../utils/localStorage';
import { UserNotFoundError, defaultCurrencies, defaultPaymentMethods, loadData } from '../utils/processData';

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
    user: User;
}

interface Config {
    parameters: Parameters;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
    discounts: number[];
}

export const ConfigProvider: FC<ConfigProviderProps> = ({ children, shop }) => {
    const [state, setState] = useState(State.init);
    const [config, setConfig] = useLocalStorage<Config | undefined>('Parameters', undefined);
    const [shopName, setShopName] = useState('');
    const [shopEmail, setShopEmail] = useState(EMAIL);
    const [thanksMessage, setThanksMessage] = useState('');
    const [mercurial, setMercurial] = useState(Mercurial.none);
    const [user, setUser] = useState<User>({ name: '', role: Role.none });
    const [lastModified, setLastModified] = useState(new Date().toLocaleString());
    const [currencyIndex, setCurrencyIndex] = useState(0);
    const [currencies, setCurrencies] = useState<Currency[]>(defaultCurrencies);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [discounts, setDiscounts] = useState<number[]>([]);

    const setCurrency = useCallback(
        (label: string) => {
            const index = currencies.findIndex(({ label: l }) => l === label);
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
        setUser(data.parameters.user);
        setCurrencies(data.currencies);
        setPaymentMethods(data.paymentMethods);
        setInventory(data.inventory);
        setDiscounts(data.discounts);
    }, []);

    const storeData = useCallback(
        (data: Config | undefined) => {
            if (
                data?.currencies.length &&
                data?.paymentMethods.length &&
                data?.inventory.length &&
                data?.discounts.length &&
                data?.parameters
            ) {
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

                    if (error instanceof UserNotFoundError) {
                        setShopEmail(String(error.cause));
                        setState(State.unidentified);
                    } else if (config) {
                        updateConfig(config);
                        setState(State.error);
                    } else {
                        loadData(shop, false)
                            .then((data) => {
                                setState(storeData(data) ? State.error : State.fatal);
                            })
                            .catch((error) => {
                                console.error(error);
                                setShopEmail(String(error.cause));
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
                user,
                lastModified,
                currencyIndex,
                setCurrency,
                currencies,
                paymentMethods,
                inventory,
                discounts,
            }}
        >
            {children}
        </ConfigContext.Provider>
    );
};
