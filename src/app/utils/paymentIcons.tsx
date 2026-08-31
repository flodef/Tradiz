import {
    IconAward,
    IconBeach,
    IconBuildingBank,
    IconCash,
    IconCoin,
    IconCoins,
    IconCreditCard,
    IconCurrencySolana,
    IconDotsCircleHorizontal,
    IconHourglass,
    IconPercentage,
    IconPrinter,
    IconReceipt2,
    IconReceiptRefund,
    IconTicket,
    IconTransfer,
    IconWallet,
} from '@tabler/icons-react';
import { FC } from 'react';
import { PRINT_KEYWORD, REFUND_KEYWORD, WAITING_KEYWORD, USE_FIDELITY_KEYWORD } from './constants';

export type PaymentIconType = FC<{ size?: number | string; className?: string }>;

// Maps a payment method type (or cashier action keyword) to a Tabler icon.
// Falls back to IconWallet for unknown types.
const ICON_MAP: Record<string, PaymentIconType> = {
    // Standard payment methods
    'Carte Bancaire': IconCreditCard,
    'Carte bancaire': IconCreditCard,
    CB: IconCreditCard,
    Espèces: IconCash,
    Chèque: IconReceipt2,
    'Ticket Restaurant': IconTicket,
    'Ticket restaurant': IconTicket,
    'Chèque Vacances': IconBeach,
    'Chèque vacances': IconBeach,
    'Carte Fidélité': IconAward,
    'Carte fidélité': IconAward,
    Fidélité: IconAward,
    Solana: IconCurrencySolana,
    'Ğ1 June': IconCoin,
    June: IconCoin,
    Virement: IconTransfer,
    // Cashier actions (non-payment keywords shown as icons)
    [PRINT_KEYWORD]: IconPrinter,
    [WAITING_KEYWORD]: IconHourglass,
    ['METTRE ' + WAITING_KEYWORD]: IconHourglass,
    [REFUND_KEYWORD]: IconReceiptRefund,
    [USE_FIDELITY_KEYWORD]: IconAward,
    'PAIEMENT PARTIEL': IconPercentage,
    DEBIT: IconBuildingBank,
    PROVISION: IconCoins,
};

// Aliases for fuzzy matching (lowercase, without accents)
const ALIASES: { match: string; icon: PaymentIconType }[] = [
    { match: 'carte bancaire', icon: IconCreditCard },
    { match: 'espec', icon: IconCash },
    { match: 'cheque', icon: IconReceipt2 },
    { match: 'ticket', icon: IconTicket },
    { match: 'vacances', icon: IconBeach },
    { match: 'fidelite', icon: IconAward },
    { match: 'solana', icon: IconCurrencySolana },
    { match: 'june', icon: IconCoin },
    { match: 'virement', icon: IconTransfer },
    { match: 'bancaire', icon: IconCreditCard },
    { match: 'banque', icon: IconBuildingBank },
    { match: 'debit', icon: IconBuildingBank },
    { match: 'provision', icon: IconCoins },
];

function normalize(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function getPaymentIcon(type: string): PaymentIconType {
    // Exact match first
    if (ICON_MAP[type]) return ICON_MAP[type];

    // Fuzzy alias match
    const normalized = normalize(type);
    for (const alias of ALIASES) {
        if (normalized.includes(alias.match)) return alias.icon;
    }

    return IconWallet;
}

export { IconDotsCircleHorizontal };
