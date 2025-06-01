import { createContext, useContext } from 'react';
import { Parameters } from '../contexts/ConfigProvider';

export enum State {
    init,
    loading,
    error,
    fatal,
    unidentified,
    preloaded,
    loaded,
}

export enum Role {
    none = 'Aucun',
    cashier = 'Caisse',
    service = 'Service',
    kitchen = 'Cuisine',
}

export interface User {
    key?: string;
    name: string;
    role: Role;
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
    currency: string;
}

export interface InventoryItem {
    category: string;
    rate: number;
    products: { label: string; prices: number[] }[];
}

export interface Discount {
    value: number;
    unit: string;
}
export const EmptyDiscount: Discount = { value: 0, unit: '' };

export interface Colors {
    light: string;
    dark: string;
}

export interface Printer {
    name: string;
    address: string;
}

export interface ConfigContextState {
    state: State;
    setState: (value: State) => void;
    isStateReady: boolean;
    parameters: Parameters;
    currencyIndex: number;
    setCurrency: (label: string) => void;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
    discounts: Discount[];
    colors: Colors[];
    getPrintersNames: () => string[];
    getPrinterAddresses: (name?: string) => string[];
}

export const ConfigContext = createContext<ConfigContextState>({} as ConfigContextState);

export function useConfig(): ConfigContextState {
    return useContext(ConfigContext);
}
