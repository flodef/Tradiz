'use client';

import { FC, ReactNode, useEffect, useState } from 'react';
import { ConfigContext, InventoryItem, State } from '../hooks/useConfig';
import { LoadData } from '../utils/data';
import { useLocalStorage } from '../utils/localStorage';

export interface ConfigProviderProps {
    children: ReactNode;
}

interface Config {
    parameters: {
        maxValue: number;
        maxDecimals: number;
        currency: string;
        paymentMethods: string[];
    };
    inventory: InventoryItem[];
}

export const ConfigProvider: FC<ConfigProviderProps> = ({ children }) => {
    const [state, setState] = useState(State.init);
    const [config, setConfig] = useLocalStorage<Config | undefined>('Parameters', undefined);
    const [maxDecimals, setMaxDecimals] = useState(2);
    const [maxValue, setMaxValue] = useState(999.99);
    const [currency, setCurrency] = useState('€');
    const [paymentMethods, setPaymentMethods] = useState(['CB', 'Espèces', 'Chèque']);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);

    useEffect(() => {
        if (state === State.init) {
            setState(State.loading);
            LoadData()
                .then((data) => {
                    setConfig(data);
                    updateConfig(data);
                    setState(State.done);
                })
                .catch(() => {
                    if (config) {
                        updateConfig(config);
                    } else {
                        setState(State.error);
                    }
                });
        }
    }, [setConfig, config, state]);

    function updateConfig(data: Config) {
        setInventory(data.inventory);
        setMaxDecimals(data.parameters.maxDecimals);
        setMaxValue(data.parameters.maxValue);
        setCurrency(data.parameters.currency);
        setPaymentMethods(data.parameters.paymentMethods);
    }

    function toCurrency(value: number) {
        return value.toCurrency(maxDecimals, currency);
    }

    return (
        <ConfigContext.Provider
            value={{
                state,
                maxDecimals,
                maxValue,
                currency,
                paymentMethods,
                inventory,
                toCurrency,
            }}
        >
            {children}
        </ConfigContext.Provider>
    );
};
