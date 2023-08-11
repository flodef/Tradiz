import { createContext, useContext } from 'react';

export enum State {
    init,
    loading,
    error,
    fatal,
    unidentified,
    done,
}

export enum Mercurial {
    none = 'Aucune',
    exponential = 'Exponentielle',
    soft = 'Douce',
    zelet = 'Zelet',
}

export interface Currency {
    label: string;
    maxValue: number;
    symbol: string;
    maxDecimals: number;
}

export interface PaymentMethod {
    method: string;
    address?: string;
}

export interface InventoryItem {
    category: string;
    rate: number;
    products: { label: string; prices: number[] }[];
}

export interface ConfigContextState {
    state: State;
    setState: (value: State) => void;
    shopEmail: string;
    shopName: string;
    thanksMessage: string;
    mercurial: Mercurial;
    lastModified: string;
    currencyIndex: number;
    setCurrency: (currency: string) => void;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
}

export const ConfigContext = createContext<ConfigContextState>({} as ConfigContextState);

export function useConfig(): ConfigContextState {
    return useContext(ConfigContext);
}
