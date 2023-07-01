import { MutableRefObject, createContext, useContext } from 'react';

export interface Element {
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
    products: MutableRefObject<[Element] | undefined>;
    categories: MutableRefObject<[Element] | undefined>;
    payments: MutableRefObject<[Element] | undefined>;
    addPayment: (method: string) => void;
    transactions: MutableRefObject<[{ method: string; amount: number; date: Date; products: [Element] }] | undefined>;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
