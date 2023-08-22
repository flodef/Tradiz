import { MutableRefObject, createContext, useContext } from 'react';
import { Currency, Mercurial } from './useConfig';

export interface DataElement {
    category: string;
    quantity: number;
    amount: number;
}

export interface Product extends DataElement {
    label: string;
    total: number;
    mercurial: Mercurial;
}

export interface Transaction {
    validator: string;
    method: string;
    amount: number;
    createdDate: number;
    modifiedDate: number;
    currency: Currency;
    products: Product[];
}

export interface DataContextState {
    total: number;
    getCurrentTotal: () => number;
    amount: number;
    setAmount: (amount: number) => void;
    quantity: number;
    setQuantity: (quantity: number) => void;
    computeQuantity: (amount: number, quantity: number, mercurial?: Mercurial) => number;
    toMercurial: (quantity: number) => number;
    setCurrentMercurial: (mercurial: Mercurial) => void;
    selectedCategory: string;
    setSelectedCategory: (category: string) => void;
    addProduct: (category: string | Product) => void;
    addProductQuantity: (product?: Product) => void;
    deleteProduct: (index: number) => void;
    displayProduct: (product: Product, currency?: Currency) => string;
    clearAmount: () => void;
    clearTotal: () => void;
    products: MutableRefObject<Product[]>;
    transactions: Transaction[];
    updateTransaction: (item: string | Transaction) => void;
    editTransaction: (index: number) => void;
    deleteTransaction: (index: number) => void;
    displayTransaction: (transaction: Transaction) => string;
    isWaitingTransaction: (transaction?: Transaction) => boolean;
    transactionsFilename: string;
    toCurrency: (element: { amount: number; currency: Currency } | number | Product | Transaction) => string;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
