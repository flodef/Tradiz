import { createContext, useContext } from 'react';

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
    unity: string;
}
export const EmptyDiscount: Discount = { value: 0, unity: '' };

export interface Colors {
    light: string;
    dark: string;
}

export interface ConfigContextState {
    state: State;
    setState: (value: State) => void;
    isStateReady: boolean;
    shopEmail: string;
    shopName: string;
    thanksMessage: string;
    mercurial: Mercurial;
    user: User;
    lastModified: string;
    currencyIndex: number;
    setCurrency: (label: string) => void;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
    discounts: Discount[];
    colors: Colors[];
}

export const ConfigContext = createContext<ConfigContextState>({} as ConfigContextState);

export function useConfig(): ConfigContextState {
    return useContext(ConfigContext);
}
