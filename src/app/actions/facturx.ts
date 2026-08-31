'use server';

import { generate, invoiceToXml } from '@stafyniaksacha/facturx';
import {
    AmountType,
    CountryIDType,
    CrossIndustryInvoiceType,
    CurrencyCodeType,
    DateTimeType,
    DocumentCodeType,
    DocumentContextParameterType,
    ExchangedDocumentContextType,
    ExchangedDocumentType,
    HeaderTradeAgreementType,
    HeaderTradeDeliveryType,
    HeaderTradeSettlementType,
    IDType,
    PercentType,
    SupplyChainEventType,
    SupplyChainTradeTransactionType,
    TaxCategoryCodeType,
    TaxRegistrationType,
    TaxTypeCodeType,
    TextType,
    TradeAddressType,
    TradePartyType,
    TradeSettlementHeaderMonetarySummationType,
    TradeTaxType,
} from '@stafyniaksacha/facturx/models';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { BillingReport } from '../utils/interfaces';
import type { Shop } from '../contexts/ConfigProvider';

export interface FacturXInput {
    report: BillingReport;
    shop: Shop;
    invoiceNumber: string;
    currencyCode?: string;
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function buildPdf(input: FacturXInput): Promise<PDFDocument> {
    const { report, shop, invoiceNumber, currencyCode = 'EUR' } = input;
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`Facture ${invoiceNumber}`);
    pdfDoc.setAuthor(shop.name);
    pdfDoc.setSubject('Facture');
    pdfDoc.setProducer('Tradiz');
    pdfDoc.setCreator('Tradiz');
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fs = 10;
    const lh = 14;
    let y = 800;

    const draw = (text: string, x: number, opts?: { bold?: boolean; size?: number }) => {
        page.drawText(text, { x, y, size: opts?.size ?? fs, font: opts?.bold ? bold : font, color: rgb(0, 0, 0) });
    };

    draw(shop.name, 40, { bold: true, size: 14 });
    y -= lh;
    if (shop.address) {
        draw(shop.address, 40);
        y -= lh;
    }
    draw(`${shop.zipCode} ${shop.city}`, 40);
    y -= lh;
    if (shop.serial) {
        draw(`SIRET: ${shop.serial}`, 40);
        y -= lh;
    }
    if (shop.vatNumber) {
        draw(`TVA: ${shop.vatNumber}`, 40);
        y -= lh;
    }

    y -= 20;
    draw(`Facture N° ${invoiceNumber}`, 40, { bold: true, size: 16 });
    y -= lh;
    draw(`Periode: ${report.startDate} - ${report.endDate}`, 40);
    y -= lh + 10;

    draw(report.companyName, 40, { bold: true, size: 12 });
    y -= lh;
    if (report.companyAddress) {
        draw(report.companyAddress, 40);
        y -= lh;
    }
    if (report.companyZipCode || report.companyCity) {
        draw(`${report.companyZipCode ?? ''} ${report.companyCity ?? ''}`.trim(), 40);
        y -= lh;
    }
    if (report.companySiret) {
        draw(`SIRET: ${report.companySiret}`, 40);
        y -= lh;
    }
    if (report.companyVatNumber) {
        draw(`TVA: ${report.companyVatNumber}`, 40);
        y -= lh;
    }

    y -= 20;
    draw('Description', 40, { bold: true });
    draw('Qte', 350, { bold: true });
    draw('Prix unit.', 410, { bold: true });
    draw('Total', 500, { bold: true });
    y -= 5;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
    y -= lh;

    for (const c of report.customers) {
        draw(`Repas - ${c.firstName} ${c.lastName}`.substring(0, 45), 40);
        draw(String(c.mealCount), 360);
        draw(`${report.employerShare.toFixed(2)} ${currencyCode}`, 410);
        draw(`${c.totalAmount.toFixed(2)} ${currencyCode}`, 500);
        y -= lh;
    }

    y -= 10;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
    y -= lh;
    draw('Total HT', 400);
    draw(`${report.totalHT.toFixed(2)} ${currencyCode}`, 500);
    y -= lh;
    draw(`TVA (${(report.vatRate * 100).toFixed(1)}%)`, 400);
    draw(`${report.totalTVA.toFixed(2)} ${currencyCode}`, 500);
    y -= lh;
    draw('Total TTC', 400, { bold: true });
    draw(`${report.totalAmount.toFixed(2)} ${currencyCode}`, 500, { bold: true });

    return pdfDoc;
}

function buildInvoiceModel(input: FacturXInput): CrossIndustryInvoiceType {
    const { report, shop, invoiceNumber, currencyCode = 'EUR' } = input;
    const profile = 'urn:cen.eu:en16931:2017';

    const ctx = new ExchangedDocumentContextType({
        guidelineSpecifiedDocumentContextParameter: new DocumentContextParameterType({
            id: new IDType({ value: profile }),
        }),
    });

    const doc = new ExchangedDocumentType({
        id: new IDType({ value: invoiceNumber }),
        typeCode: new DocumentCodeType({ value: '380' }),
        issueDateTime: new DateTimeType({
            dateTimeString: formatDate(new Date().toISOString().split('T')[0]),
            format: '102',
        }),
    });

    const sellerParty = new TradePartyType({
        name: new TextType({ value: shop.name }),
        postalTradeAddress: new TradeAddressType({
            countryID: new CountryIDType({ value: shop.country ?? 'FR' }),
            ...(shop.city ? { cityName: new TextType({ value: shop.city }) } : {}),
            ...(shop.zipCode ? { postcodeCode: new TextType({ value: shop.zipCode }) } : {}),
            ...(shop.address ? { lineOne: new TextType({ value: shop.address }) } : {}),
        }),
        ...(shop.vatNumber
            ? {
                  specifiedTaxRegistration: [
                      new TaxRegistrationType({ id: new IDType({ value: shop.vatNumber, schemeID: 'VA' }) }),
                  ],
              }
            : {}),
    });

    const buyerParty = new TradePartyType({
        name: new TextType({ value: report.companyName }),
        postalTradeAddress: new TradeAddressType({
            countryID: new CountryIDType({ value: 'FR' }),
            ...(report.companyCity ? { cityName: new TextType({ value: report.companyCity }) } : {}),
            ...(report.companyZipCode ? { postcodeCode: new TextType({ value: report.companyZipCode }) } : {}),
            ...(report.companyAddress ? { lineOne: new TextType({ value: report.companyAddress }) } : {}),
        }),
        ...(report.companyVatNumber
            ? {
                  specifiedTaxRegistration: [
                      new TaxRegistrationType({ id: new IDType({ value: report.companyVatNumber, schemeID: 'VA' }) }),
                  ],
              }
            : {}),
    });

    const tradeTax = new TradeTaxType({
        categoryCode: new TaxCategoryCodeType({ value: 'S' }),
        typeCode: new TaxTypeCodeType({ value: 'VAT' }),
        rateApplicablePercent: new PercentType({ value: report.vatRate * 100 }),
    });

    const summation = new TradeSettlementHeaderMonetarySummationType({
        lineTotalAmount: new AmountType({ value: report.totalHT, currencyID: currencyCode }),
        taxBasisTotalAmount: new AmountType({ value: report.totalHT, currencyID: currencyCode }),
        taxTotalAmount: [new AmountType({ value: report.totalTVA, currencyID: currencyCode })],
        grandTotalAmount: new AmountType({ value: report.totalAmount, currencyID: currencyCode }),
        duePayableAmount: new AmountType({ value: report.totalAmount, currencyID: currencyCode }),
    });

    const transaction = new SupplyChainTradeTransactionType({
        applicableHeaderTradeAgreement: new HeaderTradeAgreementType({
            sellerTradeParty: sellerParty,
            buyerTradeParty: buyerParty,
        }),
        applicableHeaderTradeDelivery: new HeaderTradeDeliveryType({
            actualDeliverySupplyChainEvent: new SupplyChainEventType({
                occurrenceDateTime: new DateTimeType({
                    dateTimeString: formatDate(new Date().toISOString().split('T')[0]),
                    format: '102',
                }),
            }),
        }),
        applicableHeaderTradeSettlement: new HeaderTradeSettlementType({
            invoiceCurrencyCode: new CurrencyCodeType({ value: currencyCode }),
            applicableTradeTax: [tradeTax],
            specifiedTradeSettlementHeaderMonetarySummation: summation,
        }),
    });

    return new CrossIndustryInvoiceType({
        exchangedDocumentContext: ctx,
        exchangedDocument: doc,
        supplyChainTradeTransaction: transaction,
    });
}

export async function generateFacturX(
    input: FacturXInput
): Promise<{ success: boolean; data?: Uint8Array; error?: string }> {
    try {
        const pdf = await buildPdf(input);
        const invoice = buildInvoiceModel(input);
        const xml = (await invoiceToXml(invoice)).toString();
        const facturxPdf = await generate({ pdf, xml });
        return { success: true, data: facturxPdf };
    } catch (error) {
        console.error('Factur-X generation error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
