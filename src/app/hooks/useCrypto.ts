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
    crypto: Crypto;
    paymentStatus: PaymentStatus;
    refPaymentStatus: MutableRefObject<PaymentStatus>;
    url: string | URL;
    init: () => void;
    generate: (crypto: Crypto) => void;
    retry: () => void;
    error: Error | undefined;
    errorText: string;
}

export const CryptoContext = createContext<CryptoContextState>({} as CryptoContextState);

export function useCrypto(): CryptoContextState {
    return useContext(CryptoContext);
}
