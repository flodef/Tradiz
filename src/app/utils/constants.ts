import { PublicKey, clusterApiUrl } from '@solana/web3.js';

// UI
export const EMAIL = 'flo@fims.fi';
export const OTHER_KEYWORD = 'Autres';
export const TRANSACTIONS_KEYWORD = 'Transactions';
export const WAITING_KEYWORD = 'EN ATTENTE';
export const REFUND_KEYWORD = 'REMBOURSEMENT';
export const PRINT_KEYWORD = 'Impression';
export const LOCAL_PRINTER_KEYWORD = 'Local';
export const UPDATING_KEYWORD = 'EN MODIF';
export const PROCESSING_KEYWORD = 'EN COURS';
export const DELETED_KEYWORD = 'EFFACÉE';
export const BACK_KEYWORD = 'RETOUR';
export const POS = 'POS';
export const SEPARATOR = ' : ';
export const CATEGORY_SEPARATOR = '>';
export const TRANSACTION_TIME_OUT = 60; // Time out in seconds
export const IS_LOCAL = !process.env.NEXT_PUBLIC_VERCEL_ENV;

// Solana
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV?.toLowerCase() === 'true';
export const SPL_TOKEN = new PublicKey(
    IS_DEV ? 'J99D2TvHcev22FF8rNfdUXQx31qzuoVdXRpRiPzJCH6c' : 'Pnsjp9dbenPeFZWqqPHDygzkCZ4Gr37G8mgdRK2KjQp'
);
export const ENDPOINT = IS_DEV
    ? clusterApiUrl('devnet')
    : process.env.NEXT_PUBLIC_CLUSTER_ENDPOINT || 'https://solana-mainnet.rpc.extrnode.com';
