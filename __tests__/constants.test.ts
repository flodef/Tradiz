import { describe, it, expect } from 'vitest';
import {
    DEV_EMAIL,
    CONFIG_KEYWORD,
    OTHER_KEYWORD,
    TRANSACTIONS_KEYWORD,
    WAITING_KEYWORD,
    REFUND_KEYWORD,
    UPDATING_KEYWORD,
    PROCESSING_KEYWORD,
    DELETED_KEYWORD,
    INTERNAL_PAYMENT_METHODS,
    PAYMENT_TYPES,
    PROVISION_KEYWORD,
    DEBIT_KEYWORD,
    DC,
    DC_POS,
    TRANSACTION_TIME_OUT,
    BACK_KEYWORD,
    ADMIN_CONFIG_URL,
    ADMIN_EDIT_MENU_URL,
    ADMIN_STATS_URL,
} from '../src/app/utils/constants';

describe('Constants', () => {
    describe('Keywords', () => {
        it('has correct keyword values', () => {
            expect(DEV_EMAIL).toBe('flo@tradiz.fr');
            expect(CONFIG_KEYWORD).toBe('Config');
            expect(OTHER_KEYWORD).toBe('Autres');
            expect(TRANSACTIONS_KEYWORD).toBe('Transactions');
            expect(BACK_KEYWORD).toBe('RETOUR');
        });

        it('has correct transaction status keywords', () => {
            expect(WAITING_KEYWORD).toBe('EN ATTENTE');
            expect(REFUND_KEYWORD).toBe('REMBOURSEMENT');
            expect(UPDATING_KEYWORD).toBe('EN MODIF');
            expect(PROCESSING_KEYWORD).toBe('EN COURS');
            expect(DELETED_KEYWORD).toBe('EFFACÉE');
        });
    });

    describe('Payment methods', () => {
        it('has correct internal payment methods list', () => {
            expect(INTERNAL_PAYMENT_METHODS).toContain(WAITING_KEYWORD);
            expect(INTERNAL_PAYMENT_METHODS).toContain(REFUND_KEYWORD);
            expect(INTERNAL_PAYMENT_METHODS).toContain(UPDATING_KEYWORD);
            expect(INTERNAL_PAYMENT_METHODS).toContain(PROCESSING_KEYWORD);
            expect(INTERNAL_PAYMENT_METHODS).toContain(DELETED_KEYWORD);
        });

        it('has correct payment types', () => {
            expect(PAYMENT_TYPES).toContain('Carte Bancaire');
            expect(PAYMENT_TYPES).toContain('Espèces');
            expect(PAYMENT_TYPES).toContain('Chèque');
            expect(PAYMENT_TYPES).toContain('Ticket Restaurant');
            expect(PAYMENT_TYPES).toContain('Chèque Vacances');
            expect(PAYMENT_TYPES).toContain('Solana');
            expect(PAYMENT_TYPES).toContain('Ğ1 June');
            expect(PAYMENT_TYPES).toContain('Virement');
        });

        it('does not include Provision or Debit as payment types', () => {
            expect(PAYMENT_TYPES).not.toContain(PROVISION_KEYWORD);
            expect(PAYMENT_TYPES).not.toContain(DEBIT_KEYWORD);
            expect(PAYMENT_TYPES).not.toContain('Provision');
            expect(PAYMENT_TYPES).not.toContain('Debit');
        });

        it('has correct special payment option keywords', () => {
            expect(PROVISION_KEYWORD).toBe('PROVISION');
            expect(DEBIT_KEYWORD).toBe('DEBIT');
        });

        it('payment types array is not empty', () => {
            expect(PAYMENT_TYPES.length).toBeGreaterThan(0);
        });
    });

    describe('Database constants', () => {
        it('has correct database names', () => {
            expect(DC).toBe('DC');
            expect(DC_POS).toBe('DC_POS');
        });
    });

    describe('Configuration constants', () => {
        it('has correct transaction timeout', () => {
            expect(TRANSACTION_TIME_OUT).toBe(60);
            expect(typeof TRANSACTION_TIME_OUT).toBe('number');
        });
    });

    describe('Admin URL constants', () => {
        it('has correct admin config URL', () => {
            expect(ADMIN_CONFIG_URL).toBe('/admin/kitchen/config');
            expect(typeof ADMIN_CONFIG_URL).toBe('string');
        });

        it('has correct admin edit menu URL', () => {
            expect(ADMIN_EDIT_MENU_URL).toBe('/admin/edit_menu');
            expect(typeof ADMIN_EDIT_MENU_URL).toBe('string');
        });

        it('has correct admin stats URL', () => {
            expect(ADMIN_STATS_URL).toBe('/stats/d/vue-dc-1/vue-dc');
            expect(typeof ADMIN_STATS_URL).toBe('string');
        });

        it('admin stats URL can be sliced to get base stats URL', () => {
            const baseStatsUrl = ADMIN_STATS_URL.split('/').slice(0, 2).join('/');
            expect(baseStatsUrl).toBe('/stats');
        });
    });

    describe('Internal payment methods include all status keywords', () => {
        it('includes all transaction status keywords in internal payment methods', () => {
            expect(INTERNAL_PAYMENT_METHODS).toContain(WAITING_KEYWORD);
            expect(INTERNAL_PAYMENT_METHODS).toContain(REFUND_KEYWORD);
            expect(INTERNAL_PAYMENT_METHODS).toContain(UPDATING_KEYWORD);
            expect(INTERNAL_PAYMENT_METHODS).toContain(PROCESSING_KEYWORD);
            expect(INTERNAL_PAYMENT_METHODS).toContain(DELETED_KEYWORD);
        });
    });
});
