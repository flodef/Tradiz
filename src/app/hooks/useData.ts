import { MutableRefObject, createContext, useContext } from 'react';
import { Currency, Mercurial } from './useConfig';

export interface DataElement {
    category: string;
    quantity: number;
    amount: number;
}

export interface ProductElement extends DataElement {
    label: string;
    total: number;
    currency: Currency;
    mercurial: Mercurial;
}

export interface Transaction {
    method: string;
    amount: number;
    date: string;
    currency: Currency;
    products: ProductElement[];
}

export interface DataContextState {
    total: number;
    getCurrentTotal: () => number;
    amount: number;
    setAmount: (amount: number) => void;
    quantity: number;
    setQuantity: (quantity: number) => void;
    computeQuantity: (amount: number, quantity: number, maxValue: number) => number;
    toMercurial: (quantity: number) => number;
    setCurrentMercurial: (mercurial: Mercurial) => void;
    selectedCategory: string;
    setSelectedCategory: (category: string) => void;
    addProduct: (category: string | ProductElement) => void;
    addProductQuantity: (product?: ProductElement) => void;
    deleteProduct: (index: number) => void;
    displayProduct: (product: ProductElement) => string;
    clearAmount: () => void;
    clearTotal: () => void;
    products: MutableRefObject<ProductElement[] | undefined>;
    addTransaction: (method: string) => void;
    transactions: Transaction[] | undefined;
    saveTransactions: (transactions: Transaction[]) => void;
    editTransaction: (index: number) => void;
    toCurrency: (value: number, currency?: Currency) => string;
    displayTransaction: (transaction: Transaction) => string;
    isWaitingTransaction: (transaction?: Transaction) => boolean;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
