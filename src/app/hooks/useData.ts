import { MutableRefObject, createContext, useContext } from 'react';

export interface DataContextState {
    total: number;
    totalAmount: MutableRefObject<number>;
    currentAmount: MutableRefObject<number>;
    numPadValue: number;
    setNumPadValue: (value: number) => void;
    addTransaction: (category: string, amount: number) => void;
    clearTotal: () => void;
    showTransactionSummary: () => void;
    clearTransactionSummary: () => void;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
