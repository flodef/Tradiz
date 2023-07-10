import { createContext, useContext } from 'react';

export enum State {
    init,
    loading,
    error,
    fatal,
    done,
}

export interface InventoryItem {
    category: string;
    rate: number;
    products: { label: string; price: number }[];
}

export interface ConfigContextState {
    state: State;
    maxDecimals: number;
    maxValue: number;
    currency: string;
    paymentMethods: string[];
    lastModified: string;
    inventory: InventoryItem[];
    setState: (value: State) => void;
    toCurrency: (value: number) => string;
}

export const ConfigContext = createContext<ConfigContextState>({} as ConfigContextState);

export function useConfig(): ConfigContextState {
    return useContext(ConfigContext);
}
