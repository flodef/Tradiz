import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@stafyniaksacha/facturx', () => ({
    generate: vi.fn(async ({ xml }: { pdf: unknown; xml: string }) => {
        return new Uint8Array([1, 2, 3, ...new TextEncoder().encode(xml)]);
    }),
    invoiceToXml: vi.fn(async (): Promise<{ toString: () => string }> => ({ toString: () => '<xml>mock</xml>' })),
}));

vi.mock('@stafyniaksacha/facturx/models', () => {
    const makeClass = () => {
        return class {
            constructor(data?: Record<string, unknown>) {
                Object.assign(this, data ?? {});
            }
        };
    };
    const classes = [
        'AmountType',
        'CountryIDType',
        'CrossIndustryInvoiceType',
        'CurrencyCodeType',
        'DateTimeType',
        'DocumentCodeType',
        'DocumentContextParameterType',
        'ExchangedDocumentContextType',
        'ExchangedDocumentType',
        'HeaderTradeAgreementType',
        'HeaderTradeDeliveryType',
        'HeaderTradeSettlementType',
        'IDType',
        'PercentType',
        'SupplyChainEventType',
        'SupplyChainTradeTransactionType',
        'TaxCategoryCodeType',
        'TaxRegistrationType',
        'TaxTypeCodeType',
        'TextType',
        'TradeAddressType',
        'TradePartyType',
        'TradeSettlementHeaderMonetarySummationType',
        'TradeTaxType',
    ];
    const mock: Record<string, unknown> = {};
    for (const cls of classes) mock[cls] = makeClass();
    return mock;
});

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

import { generateFacturX, type FacturXInput } from '../src/app/actions/facturx';
import type { BillingReport } from '../src/app/utils/interfaces';
import type { Shop } from '../src/app/contexts/ConfigProvider';

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
};

describe('generateFacturX', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should generate a Factur-X PDF successfully', async () => {
        const input: FacturXInput = {
            report: mockReport,
            shop: mockShop,
            invoiceNumber: 'FAC-202501-1',
        };

        const result = await generateFacturX(input);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data!.length).toBeGreaterThan(0);
    });

    it('should handle missing company fields gracefully', async () => {
        const input: FacturXInput = {
            report: { ...mockReport, companySiret: undefined, companyVatNumber: undefined, companyAddress: undefined },
            shop: mockShop,
            invoiceNumber: 'FAC-202501-2',
        };

        const result = await generateFacturX(input);

        expect(result.success).toBe(true);
    });

    it('should handle missing shop VAT number gracefully', async () => {
        const input: FacturXInput = {
            report: mockReport,
            shop: { ...mockShop, vatNumber: undefined },
            invoiceNumber: 'FAC-202501-3',
        };

        const result = await generateFacturX(input);

        expect(result.success).toBe(true);
    });
});
