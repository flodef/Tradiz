import { MutableRefObject, createContext, useContext } from 'react';

export interface DataContextState {
    total: number;
    totalAmount: MutableRefObject<number>;
    currentAmount: MutableRefObject<number>;
    numPadValue: number;
    addProduct: (category: string) => void;
    deleteProduct: (label: string) => void;
    updateAmount: (amount: number) => void;
    clearAmount: () => void;
    clearTotal: () => void;
    products: MutableRefObject<[{ category: string; amount: number }] | undefined>;
    transactions: MutableRefObject<[{ category: string; quantity: number; amount: number }] | undefined>;
    addPayment: (method: string) => void;
    payments: MutableRefObject<[{ method: string; quantity: number; amount: number }] | undefined>;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
