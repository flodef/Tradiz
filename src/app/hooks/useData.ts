import { MutableRefObject, createContext, useContext } from 'react';

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
    selectedCategory: string;
    setSelectedCategory: (category: string) => void;
    addProduct: (category: string | DataElement) => void;
    deleteProduct: (option: string, index: number) => void;
    clearAmount: () => void;
    clearTotal: () => void;
    products: MutableRefObject<[DataElement] | undefined>;
    addPayment: (method: string) => void;
    transactions: [Transaction] | undefined;
    saveTransactions: (transactions: [Transaction]) => void;
    editTransaction: (option: string, index: number) => void;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
