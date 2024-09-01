'use client';

import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
    Colors,
    ConfigContext,
    Currency,
    Discount,
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

export interface Parameters {
    shopName: string;
    shopEmail: string;
    thanksMessage: string;
    mercurial: Mercurial;
    lastModified: string;
    user: User;
}

export interface Config {
    parameters: Parameters;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
    discounts: Discount[];
    colors: Colors[];
}

export interface ConfigProviderProps {
    children: ReactNode;
    shop: string;
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
    const [discounts, setDiscounts] = useState<Discount[]>([]);
    const [colors, setColors] = useState<Colors[]>([]);

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

    const loadConfig = useCallback((data: Config | undefined) => {
        if (!data) return;

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
        setColors(data.colors);

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
            setState(State.loading);

            loadConfig(config);

            if (!config || !process.env.NEXT_PUBLIC_IS_DEV) {
                loadData(shop)
                    .then(storeData)
                    .catch((error) => {
                        console.error(error);

                        if (error instanceof UserNotFoundError) {
                            setShopEmail(String(error.cause));
                            setState(State.unidentified);
                        } else {
                            setState(State.error);
                        }
                    });
            }
        }
    }, [state, config, storeData, loadConfig, shop]);

    return (
        <ConfigContext.Provider
            value={{
                state,
                setState,
                isStateReady,
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
                colors,
            }}
        >
            {children}
        </ConfigContext.Provider>
    );
};
