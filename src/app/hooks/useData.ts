import { ChangeEvent, createContext, MutableRefObject, useContext } from 'react';
import { Discount, Mercurial } from './useConfig';

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
    displayProduct: (product: Product, currency?: string) => string;
    clearAmount: () => void;
    clearTotal: () => void;
    products: MutableRefObject<Product[]>;
    transactions: Transaction[];
    processTransactions: (syncAction: SyncAction, date?: Date, event?: ChangeEvent<HTMLInputElement>) => void;
    updateTransaction: (item: string | Transaction) => void;
    editTransaction: (index: number) => void;
    deleteTransaction: (index: number) => void;
    displayTransaction: (transaction: Transaction) => string;
    isWaitingTransaction: (transaction?: Transaction) => boolean;
    isUpdatingTransaction: (transaction?: Transaction) => boolean;
    isDeletedTransaction: (transaction?: Transaction) => boolean;
    transactionsFilename: string;
    toCurrency: (element: { amount: number; currency: string } | number | Product | Transaction) => string;
    isDbConnected: boolean;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
