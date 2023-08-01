import { MutableRefObject, createContext, useContext } from 'react';

export enum Crypto {
    Solana = 'Solana',
    June = 'Ğ1 June',
}

export enum PaymentStatus {
    New = 'new',
    Pending = 'pending',
    Confirmed = 'confirmed',
    Valid = 'valid',
    Finalized = 'finalized',
    Error = 'error',
}

export interface CryptoContextState {
    setCrypto: (crypto: Crypto) => void;
    paymentStatus: PaymentStatus;
    refPaymentStatus: MutableRefObject<PaymentStatus>;
    url: string | URL;
    init: () => void;
    generate: () => void;
    retry: () => void;
    error: Error | undefined;
    errorText: string;
}

export const CryptoContext = createContext<CryptoContextState>({} as CryptoContextState);

export function usePayment(): CryptoContextState {
    return useContext(CryptoContext);
}
