import { MutableRefObject, createContext, useContext } from 'react';
import { Currency, Discount, Mercurial } from './useConfig';

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
    currency: Currency;
    products: Product[];
};

export type TransactionSet = {
    id: string;
    transactions: Transaction[];
};

export interface DataContextState {
    total: number;
    getCurrentTotal: () => number;
    amount: number;
    setAmount: (amount: number) => void;
    quantity: number;
    setQuantity: (quantity: number) => void;
    computeQuantity: (product: Product, quantity: number) => void;
    setDiscount: (product: Product, discount: Discount) => void;
    toMercurial: (quantity: number, mercurial?: Mercurial) => number;
    setCurrentMercurial: (mercurial: Mercurial) => void;
    selectedProduct: Product | undefined;
    setSelectedProduct: (product?: Product) => void;
    addProduct: (product?: Product) => void;
    removeProduct: (product?: Product) => void;
    deleteProduct: (index: number) => void;
    displayProduct: (product: Product, currency?: Currency) => string;
    clearAmount: () => void;
    clearTotal: () => void;
    products: MutableRefObject<Product[]>;
    transactions: Transaction[];
    getAllTransactions: () => void;
    updateTransaction: (item: string | Transaction) => void;
    editTransaction: (index: number) => void;
    deleteTransaction: (index: number) => void;
    displayTransaction: (transaction: Transaction) => string;
    isWaitingTransaction: (transaction?: Transaction) => boolean;
    isDeletedTransaction: (transaction?: Transaction) => boolean;
    transactionsFilename: string;
    toCurrency: (element: { amount: number; currency: Currency } | number | Product | Transaction) => string;
    isDbConnected: boolean;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
