import { createContext, useContext } from 'react';

export interface DataElement {
    category: string;
    label?: string;
    quantity: number;
    amount: number;
}

export interface Transaction {
    method: string;
    amount: number;
    date: string;
    products: [DataElement];
}

export interface DataContextState {
    total: number;
    amount: number;
    setAmount: (amount: number) => void;
    quantity: number;
    setQuantity: (quantity: number) => void;
    category: string;
    setCategory: (category: string) => void;
    addProduct: (category: string | DataElement) => void;
    deleteProduct: (label: string, index: number) => void;
    clearAmount: () => void;
    clearTotal: () => void;
    products: [DataElement] | undefined;
    addPayment: (method: string) => void;
    transactions: [Transaction] | undefined;
    saveTransactions: (transactions: [Transaction]) => void;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
