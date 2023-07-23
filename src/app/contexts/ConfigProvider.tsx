'use client';

import { FC, ReactNode, useCallback, useEffect, useState } from 'react';
import { ConfigContext, InventoryItem, PaymentMethod, State } from '../hooks/useConfig';
import { LoadData } from '../utils/data';
import { useLocalStorage } from '../utils/localStorage';

export interface ConfigProviderProps {
    children: ReactNode;
}

export interface Parameters {
    shopName: string;
    thanksMessage: string;
    maxValue: number;
    maxDecimals: number;
    currency: string;
    lastModified: string;
}

interface Config {
    parameters: Parameters;
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
}

export const ConfigProvider: FC<ConfigProviderProps> = ({ children }) => {
    const [state, setState] = useState(State.init);
    const [config, setConfig] = useLocalStorage<Config | undefined>('Parameters', undefined);
    const [shopName, setShopName] = useState('');
    const [thanksMessage, setThanksMessage] = useState('Merci de votre visite !');
    const [maxValue, setMaxValue] = useState(999.99);
    const [maxDecimals, setMaxDecimals] = useState(2);
    const [currency, setCurrency] = useState('€');
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
    const [lastModified, setLastModified] = useState(new Date().toLocaleString());
    const [inventory, setInventory] = useState<InventoryItem[]>([]);

    const updateConfig = useCallback((data: Config) => {
        setShopName(data.parameters.shopName);
        setThanksMessage(data.parameters.thanksMessage);
        setMaxDecimals(data.parameters.maxDecimals);
        setMaxValue(data.parameters.maxValue);
        setCurrency(data.parameters.currency);
        setLastModified(data.parameters.lastModified);
        setPaymentMethods(data.paymentMethods);
        setInventory(data.inventory);
    }, []);

    const storeData = useCallback(
        (data: Config | undefined) => {
            if (data?.inventory.length && data?.parameters) {
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
                maxDecimals,
                maxValue,
                currency,
                paymentMethods,
                lastModified,
                inventory,
            }}
        >
            {children}
        </ConfigContext.Provider>
    );
};
