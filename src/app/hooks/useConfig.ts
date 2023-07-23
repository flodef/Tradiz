import { createContext, useContext } from 'react';

export enum State {
    init,
    loading,
    error,
    fatal,
    done,
}

export interface PaymentMethod {
    method: string;
    reference?: string;
}

export interface InventoryItem {
    category: string;
    rate: number;
    products: { label: string; price: number }[];
}

export interface ConfigContextState {
    state: State;
    setState: (value: State) => void;
    shopName: string;
    thanksMessage: string;
    maxDecimals: number;
    maxValue: number;
    currency: string;
    paymentMethods: PaymentMethod[];
    lastModified: string;
    inventory: InventoryItem[];
}

export const ConfigContext = createContext<ConfigContextState>({} as ConfigContextState);

export function useConfig(): ConfigContextState {
    return useContext(ConfigContext);
}
