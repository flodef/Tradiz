import { PublicKey, TransactionSignature } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { MutableRefObject, createContext, useContext } from 'react';

export enum PaymentStatus {
    New = 'new',
    Pending = 'pending',
    Confirmed = 'confirmed',
    Valid = 'valid',
    Finalized = 'finalized',
    Error = 'error',
}

export enum AirdropStatus {
    RetrievingRecipient = 'retrievingRecipient',
    TransferingSOL = 'transferingSOL',
    ConfirmingSOLTransfer = 'confirmingSOLTransfer',
    DecryptingAccount = 'decryptingAccount',
    RetrievingTokenAccount = 'retrievingTokenAccount',
    TransferingToken = 'transferingToken',
    ConfirmingTokenTransfer = 'confirmingTokenTransfer',
}

export interface PaymentContextState {
    amount: BigNumber | undefined;
    memo: string | undefined;
    setMemo(memo: string | undefined): void;
    balance?: BigNumber;
    reference: PublicKey | undefined;
    signature: TransactionSignature | undefined;
    paymentStatus: MutableRefObject<PaymentStatus>;
    confirmationProgress: number;
    url: URL;
    generate(): void;
    retry: () => void;
    error: Error | undefined;
    errorText: string;
}

export const PaymentContext = createContext<PaymentContextState>({} as PaymentContextState);

export function usePayment(): PaymentContextState {
    return useContext(PaymentContext);
}
