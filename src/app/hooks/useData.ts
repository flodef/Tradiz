import { MutableRefObject, createContext, useContext } from 'react';

export interface DataElement {
    category: string;
    quantity: number;
    amount: number;
}

export interface DataContextState {
    total: number;
    amount: number;
    setAmount: (amount: number) => void;
    quantity: number;
    setQuantity: (quantity: number) => void;
    addProduct: (category: string) => void;
    deleteProduct: (label: string, index: number) => void;
    clearAmount: () => void;
    clearTotal: () => void;
    products: [DataElement] | undefined;
    addPayment: (method: string) => void;
    data: [{ method: string; amount: number; date: string; products: [DataElement] }] | undefined;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
