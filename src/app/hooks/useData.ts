import { MutableRefObject, createContext, useContext } from 'react';

export interface DataContextState {
    total: number;
    totalAmount: MutableRefObject<number>;
    currentAmount: MutableRefObject<number>;
    numPadValue: number;
    addProduct: (category: string, amount: number) => void;
    updateAmount: (amount: number) => void;
    clearAmount: () => void;
    clearTotal: () => void;
    showTransaction: () => void;
    clearTransaction: () => void;
    addPayment: (method: string) => void;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
