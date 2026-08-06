import '@/app/utils/extensions';
import { beforeEach, describe, expect, it } from 'vitest';
import {
    buildCustomerDisplay,
    buildIdleDisplay,
    buildPaymentDisplay,
    buildTransactionDisplay,
    getPaymentMessage,
    holdChangeDisplay,
    isChangeDisplayHeld,
    releaseChangeDisplay,
} from '@/app/utils/customerDisplay';
import { Currency, EmptyDiscount, Product } from '@/app/utils/interfaces';

const DISPLAY_WIDTH = 20;

const euro: Currency = { label: 'Euro', maxValue: 1000, symbol: '€', decimals: 2, rate: 1, fee: 0 };

const product = (label: string, amount = 1): Product => ({
    category: 'Boissons',
    label,
    amount,
    quantity: 1,
    total: amount,
    discount: EmptyDiscount,
});

// Both lines must always be exactly 20 characters so the hardware never mis-aligns.
const expectExactWidth = (payload: { line1: string; line2: string }) => {
    expect(payload.line1).toHaveLength(DISPLAY_WIDTH);
    expect(payload.line2).toHaveLength(DISPLAY_WIDTH);
};

describe('buildIdleDisplay', () => {
    it('shows only "Fermé" when closed, never the shop name', () => {
        const payload = buildIdleDisplay('Chez Tradiz', true);

        expect(payload.line1.trim()).toBe('');
        expect(payload.line2.trim()).toBe('Fermé');
        expect(payload.line2).not.toContain('Tradiz');
        expectExactWidth(payload);
    });

    it('keeps the accent on "Fermé"', () => {
        expect(buildIdleDisplay('', true).line2).toContain('é');
    });

    it('shows a short shop name centered on the second line', () => {
        const payload = buildIdleDisplay('Chez Tradiz', false);

        expect(payload.line1.trim()).toBe('');
        expect(payload.line2.trim()).toBe('CHEZ TRADIZ');
        expectExactWidth(payload);
    });

    it('wraps a long shop name across both lines, centered and uppercased', () => {
        const payload = buildIdleDisplay('Boulangerie Patisserie du Vieux Port', false);

        expect(payload.line1.trim()).toBe('BOULANGERIE');
        expect(payload.line2.trim()).toBe('PATISSERIE DU VIEUX');
        expectExactWidth(payload);
    });

    it('truncates a shop name longer than 40 chars', () => {
        const payload = buildIdleDisplay('x'.repeat(60), false);

        expect(payload.line1.trim()).toBe('X'.repeat(20));
        expect(payload.line2.trim()).toBe('X'.repeat(20));
        expectExactWidth(payload);
    });

    it('handles an empty shop name', () => {
        const payload = buildIdleDisplay('', false);

        expect(payload.line1.trim()).toBe('');
        expect(payload.line2.trim()).toBe('');
        expectExactWidth(payload);
    });
});

describe('buildTransactionDisplay', () => {
    it('shows the product label and the running total', () => {
        const payload = buildTransactionDisplay(product('Café'), 3.5, euro);

        expect(payload.line1.trim()).toBe('Café');
        expect(payload.line2.trim()).toBe('TOTAL          3.50€');
        expectExactWidth(payload);
    });

    it('leaves the first line blank when no product is being rung up', () => {
        const payload = buildTransactionDisplay(undefined, 0, euro);

        expect(payload.line1.trim()).toBe('');
        expect(payload.line2).toContain('0.00€');
        expectExactWidth(payload);
    });

    it('truncates a long product label without breaking the width', () => {
        const payload = buildTransactionDisplay(product('Grand sandwich jambon beurre cornichons'), 8, euro);

        expect(payload.line1).toBe('Grand sandwich jambo');
        expectExactWidth(payload);
    });

    it('keeps the amount intact even when the total is large', () => {
        const payload = buildTransactionDisplay(product('Menu'), 12345.67, euro);

        expect(payload.line2).toContain('12345.67€');
        expectExactWidth(payload);
    });
});

describe('getPaymentMessage', () => {
    // Labels come from the database, so matching is normalised rather than exact.
    it.each([
        ['Carte Bancaire', 'Insérez votre carte'],
        ['CB', 'Insérez votre carte'],
        ['carte bancaire', 'Insérez votre carte'],
        ['TPE', 'Insérez votre carte'],
        ['Espèces', 'Règlement en espèces'],
        ['ESPECES', 'Règlement en espèces'],
        ['Cash', 'Règlement en espèces'],
        ['Chèque', 'Règlement par chèque'],
        ['Cheque', 'Règlement par chèque'],
        ['Chèque Vacances', 'Chèque vacances'],
        ['Ticket Restaurant', 'Titre restaurant'],
        ['Virement', 'Virement bancaire'],
        ['Solana', 'Scannez le QR code'],
        ['Ğ1 June', 'Scannez le QR code'],
        ['DEBIT', 'Paiement sur compte'],
        ['PROVISION', 'Approvisionnement'],
    ])('maps %s to %s', (label, expected) => {
        expect(getPaymentMessage(label)).toBe(expected);
    });

    it('falls back to the raw label for an unknown payment method', () => {
        expect(getPaymentMessage('Lydia')).toBe('Lydia');
    });

    it('prefers "Chèque Vacances" over the generic cheque message', () => {
        expect(getPaymentMessage('Chèque Vacances')).not.toBe('Règlement par chèque');
    });

    it('never returns a message longer than the display width', () => {
        const labels = [
            'Carte Bancaire',
            'Espèces',
            'Chèque',
            'Ticket Restaurant',
            'Chèque Vacances',
            'Solana',
            'Ğ1 June',
            'Virement',
            'DEBIT',
            'PROVISION',
        ];
        labels.forEach((label) => expect(getPaymentMessage(label).length).toBeLessThanOrEqual(DISPLAY_WIDTH));
    });
});

describe('buildPaymentDisplay', () => {
    it('shows the payment instruction and the total', () => {
        const payload = buildPaymentDisplay('Carte Bancaire', 10, euro);

        expect(payload.line1.trim()).toBe('Insérez votre carte');
        expect(payload.line2.trim()).toBe('TOTAL         10.00€');
        expectExactWidth(payload);
    });

    it('pads an unknown short label to the display width', () => {
        const payload = buildPaymentDisplay('Lydia', 10, euro);

        expect(payload.line1.trim()).toBe('Lydia');
        expectExactWidth(payload);
    });
});

describe('buildCustomerDisplay', () => {
    it('shows the total and the change owed', () => {
        const payload = buildCustomerDisplay(12.4, 20, 7.6, euro);

        expect(payload.line1.trim()).toBe('TOTAL         12.40€');
        expect(payload.line2.trim()).toBe('RENDU          7.60€');
        expectExactWidth(payload);
    });

    it('prioritises the value over the label when space is tight', () => {
        const payload = buildCustomerDisplay(123456.78, 200000, 76543.22, euro);

        expect(payload.line1).toContain('123456.78€');
        expectExactWidth(payload);
    });
});

describe('change display hold', () => {
    beforeEach(() => releaseChangeDisplay());

    it('is not held by default', () => {
        expect(isChangeDisplayHeld()).toBe(false);
    });

    it('is held once the change has been pushed', () => {
        holdChangeDisplay();
        expect(isChangeDisplayHeld()).toBe(true);
    });

    it('is released when the next transaction starts', () => {
        holdChangeDisplay();
        releaseChangeDisplay();
        expect(isChangeDisplayHeld()).toBe(false);
    });
});
