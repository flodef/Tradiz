export enum Role {
    none = 'Aucun',
    cashier = 'Caisse',
    service = 'Service',
    kitchen = 'Cuisine',
}

export enum State {
    init,
    loading,
    error,
    fatal,
    unidentified,
    preloaded,
    loaded,
}

export enum Mercurial {
    none = 'Aucune',
    exponential = 'Exponentielle',
    soft = 'Douce',
    zelet = 'Zelet',
}

export interface Category {
    label: string;
    vat: number;
}

export interface User {
    key?: string;
    name: string;
    role: Role;
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

export enum SyncAction {
    none,
    fullsync,
    daysync,
    resync,
    export,
    import,
}

export enum SyncPeriod {
    day,
    full,
}

export type DataElement = {
    category: string;
    quantity: number;
    amount: number;
};

export type Product = DataElement & {
    label: string;
    total?: number;
    discount: Discount;
    mercurial?: Mercurial;
};

export type Transaction = {
    validator: string;
    method: string;
    amount: number;
    createdDate: number;
    modifiedDate: number;
    currency: string;
    products: Product[];
};

export type TransactionSet = {
    id: string;
    transactions: Transaction[];
};
