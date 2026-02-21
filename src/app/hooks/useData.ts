import { ChangeEvent, createContext, RefObject, useContext } from 'react';
import { Discount, Mercurial, OrderData, OrderItem, Product, SyncAction, Transaction } from '../utils/interfaces';

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
    products: RefObject<Product[]>;
    transactions: Transaction[];
    processTransactions: (syncAction: SyncAction, date?: Date, event?: ChangeEvent<HTMLInputElement>) => void;
    updateTransaction: (item: string | Transaction) => void;
    editTransaction: (index: number) => void;
    deleteTransaction: (index: number) => void;
    displayTransaction: (transaction: Transaction) => string;
    reverseTransaction: (transaction: Transaction) => Transaction;
    transactionsFilename: string;
    toCurrency: (element: { amount: number; currency: string } | number | Product | Transaction) => string;
    isDbConnected: boolean;
    orderId: string;
    setOrderId: (orderId: string) => void;
    shortNumOrder: string;
    setShortNumOrder: (shortNumOrder: string) => void;
    orderData: OrderData | null;
    setOrderData: (data: OrderData | null) => void;
    selectedOrderItems: OrderItem[];
    setSelectedOrderItems: (items: OrderItem[]) => void;
    partialPaymentAmount: number;
    setPartialPaymentAmount: (amount: number) => void;
    showPartialPaymentSelector: boolean;
    setShowPartialPaymentSelector: (show: boolean) => void;
}

export const DataContext = createContext<DataContextState>({} as DataContextState);

export function useData(): DataContextState {
    return useContext(DataContext);
}
