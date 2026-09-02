import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('pdf-lib', () => ({
    PDFDocument: {
        create: vi.fn(async () => ({
            setTitle: vi.fn(),
            setAuthor: vi.fn(),
            setSubject: vi.fn(),
            setProducer: vi.fn(),
            setCreator: vi.fn(),
            addPage: vi.fn(() => ({
                drawText: vi.fn(),
                drawLine: vi.fn(),
            })),
            embedFont: vi.fn(async () => ({})),
            save: vi.fn(async () => new Uint8Array([1, 2, 3])),
        })),
    },
    StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'HelveticaBold' },
    rgb: vi.fn(() => ({ red: 0, green: 0, blue: 0 })),
}));

import { pushInvoiceToPennyLane, findOrCreateCustomer } from '../src/app/actions/pennylane';
import type { BillingReport } from '../src/app/utils/interfaces';
import type { Shop } from '../src/app/contexts/ConfigProvider';

const mockReport: BillingReport = {
    companyId: 1,
    companyName: 'ACME Corp',
    companySiret: '98765432100054',
    companyVatNumber: 'FR98765432109',
    companyAddress: '456 Business Ave',
    companyZipCode: '92000',
    companyCity: 'Nanterre',
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    employerShare: 8.5,
    vatRate: 0.2,
    mealCount: 100,
    totalAmount: 850,
    totalHT: 708.33,
    totalTVA: 141.67,
    customers: [
        {
            customerId: 1,
            firstName: 'Jean',
            lastName: 'Dupont',
            mealCount: 20,
            totalAmount: 170,
            totalHT: 141.67,
            totalTVA: 28.33,
        },
    ],
    ticketCount: 100,
    customerPaidAmount: 850,
    vatBreakdown: [],
    ventilations: [],
    paymentTotals: [],
    refundCount: 0,
};

const mockShop: Shop = {
    name: 'Test Restaurant',
    address: '123 Rue de Test',
    zipCode: '75001',
    city: 'Paris',
    serial: '12345678900012',
    email: 'test@example.com',
    id: 'test-id',
    phone: '0102030405',
    vatNumber: 'FR12345678901',
    country: 'FR',
};

describe('pennylane', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        global.fetch = originalFetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('should return error when no token is provided', async () => {
        const result = await pushInvoiceToPennyLane({
            report: mockReport,
            shop: mockShop,
            invoiceNumber: 'FAC-202501-1',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('non configuré');
    });

    it('should find existing customer and push invoice', async () => {
        const mockFetch = vi.fn(async (url: string, opts?: RequestInit) => {
            if (url.includes('/customers?filter=')) {
                return {
                    ok: true,
                    json: async () => ({ customers: [{ id: 42 }] }),
                } as Response;
            }
            if (url.includes('/customer_invoices') && opts?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({ id: 99 }),
                } as Response;
            }
            return { ok: false, text: async () => 'not found' } as unknown as Response;
        });

        global.fetch = mockFetch as unknown as typeof fetch;

        const result = await pushInvoiceToPennyLane({
            report: mockReport,
            shop: mockShop,
            invoiceNumber: 'FAC-202501-1',
            pennylaneToken: 'test-token',
        });

        expect(result.success).toBe(true);
        expect(result.invoiceId).toBe('99');
    });

    it('should create customer if not found', async () => {
        const mockFetch = vi.fn(async (url: string, opts?: RequestInit) => {
            if (url.includes('/customers?filter=')) {
                return {
                    ok: true,
                    json: async () => ({ customers: [] }),
                } as Response;
            }
            if (url.includes('/company_customers') && opts?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({ id: 55 }),
                } as Response;
            }
            if (url.includes('/customer_invoices') && opts?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({ id: 100 }),
                } as Response;
            }
            return { ok: false, text: async () => 'not found' } as unknown as Response;
        });

        global.fetch = mockFetch as unknown as typeof fetch;

        const result = await findOrCreateCustomer(mockReport, 'test-token');

        expect(result.success).toBe(true);
        expect(result.customerId).toBe(55);
    });

    it('should handle PennyLane API errors', async () => {
        const mockFetch = vi.fn(async (url: string, opts?: RequestInit) => {
            if (url.includes('/customers?filter=')) {
                return {
                    ok: true,
                    json: async () => ({ customers: [{ id: 42 }] }),
                } as Response;
            }
            if (url.includes('/customer_invoices') && opts?.method === 'POST') {
                return {
                    ok: false,
                    text: async () => 'Validation error',
                } as unknown as Response;
            }
            return { ok: false, text: async () => 'not found' } as unknown as Response;
        });

        global.fetch = mockFetch as unknown as typeof fetch;

        const result = await pushInvoiceToPennyLane({
            report: mockReport,
            shop: mockShop,
            invoiceNumber: 'FAC-202501-1',
            pennylaneToken: 'test-token',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PennyLane API error');
    });
});
