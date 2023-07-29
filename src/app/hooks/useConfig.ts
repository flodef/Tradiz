import { createContext, useContext } from 'react';

export enum State {
    init,
    loading,
    error,
    fatal,
    done,
}

export interface Currency {
    label: string;
    maxValue: number;
    symbol: string;
    maxDecimals: number;
    isOutOfComptability: boolean;
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
    shopName: string;
    thanksMessage: string;
    lastModified: string;
    currencyIndex: number;
    setCurrencyIndex: (index: number) => void;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
}

export const ConfigContext = createContext<ConfigContextState>({} as ConfigContextState);

export function useConfig(): ConfigContextState {
    return useContext(ConfigContext);
}
