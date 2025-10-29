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

export interface Category {
    label: string;
    vat: number;
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
    decimals: number;
}

export interface PaymentMethod {
    type: string;
    id?: string;
    currency: string;
    availability: boolean;
}

export interface Product {
    name: string;
    category: string;
    availability: boolean;
    currencies: string[];
}

export interface InventoryItem {
    category: string;
    rate: number;
    products: { label: string; prices: number[] }[];
}

export interface Discount {
    amount: number;
    unit: string;
}
export const EmptyDiscount: Discount = { amount: 0, unit: '' };

export interface Color {
    label: string;
    light: string;
    dark: string;
}

export interface Printer {
    label: string;
    ipAddress: string;
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
    colors: Color[];
    getPrintersNames: () => string[];
    getPrinterAddresses: (name?: string) => string[];
}

export const ConfigContext = createContext<ConfigContextState>({} as ConfigContextState);

export function useConfig(): ConfigContextState {
    return useContext(ConfigContext);
}
