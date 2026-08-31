'use server';

import type { BillingReport } from '../utils/interfaces';
import type { Shop } from '../contexts/ConfigProvider';

const PENNYLANE_API_BASE = 'https://app.pennylane.com/api/external/v2';

function vatRateToPennyLaneCode(rate: number): string {
    const pct = Math.round(rate * 100);
    if (pct === 200) return 'FR_200';
    if (pct === 100) return 'FR_100';
    if (pct === 55) return 'FR_055';
    if (pct === 21) return 'FR_21';
    return 'FR_200';
}

export interface PennyLaneCustomer {
    id: number;
    name: string;
}

export async function findOrCreateCustomer(
    report: BillingReport,
    token: string
): Promise<{ success: boolean; customerId?: number; error?: string }> {
    if (!token) return { success: false, error: 'Token PennyLane non configuré' };

    try {
        const externalRef = `tradiz-company-${report.companyId}`;
        const filterResponse = await fetch(
            `${PENNYLANE_API_BASE}/customers?filter=${encodeURIComponent(JSON.stringify([{ field: 'external_reference', operator: 'eq', value: externalRef }]))}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (filterResponse.ok) {
            const data = await filterResponse.json();
            if (data.customers && data.customers.length > 0) {
                return { success: true, customerId: data.customers[0].id };
            }
        }

        const createResponse = await fetch(`${PENNYLANE_API_BASE}/company_customers`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: report.companyName,
                external_reference: externalRef,
                ...(report.companyVatNumber ? { vat_number: report.companyVatNumber } : {}),
                billing_address: {
                    address: report.companyAddress || '',
                    postal_code: report.companyZipCode || '',
                    city: report.companyCity || '',
                    country_alpha2: 'FR',
                },
            }),
        });

        if (!createResponse.ok) {
            const errText = await createResponse.text();
            return { success: false, error: `Failed to create customer: ${errText}` };
        }

        const created = await createResponse.json();
        return { success: true, customerId: created.id };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export interface PushToPennyLaneInput {
    report: BillingReport;
    shop: Shop;
    invoiceNumber: string;
    deadline?: string;
    pennylaneToken?: string;
}

export async function pushInvoiceToPennyLane(
    input: PushToPennyLaneInput
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
    const { report, invoiceNumber, deadline, pennylaneToken } = input;
    if (!pennylaneToken) return { success: false, error: 'Token PennyLane non configuré' };

    const customerResult = await findOrCreateCustomer(report, pennylaneToken);
    if (!customerResult.success || !customerResult.customerId) {
        return { success: false, error: customerResult.error ?? 'Failed to find/create customer' };
    }

    const today = new Date().toISOString().split('T')[0];
    const defaultDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    try {
        const response = await fetch(`${PENNYLANE_API_BASE}/customer_invoices`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${pennylaneToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                customer_id: customerResult.customerId,
                date: today,
                deadline: deadline ?? defaultDeadline,
                external_reference: invoiceNumber,
                invoice_lines: report.customers.map((c) => ({
                    label: `Repas - ${c.firstName} ${c.lastName}`,
                    quantity: c.mealCount,
                    unit: 'piece',
                    raw_currency_unit_price: report.employerShare.toFixed(2),
                    vat_rate: vatRateToPennyLaneCode(report.vatRate),
                })),
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            return { success: false, error: `PennyLane API error: ${errText}` };
        }

        const result = await response.json();
        return { success: true, invoiceId: String(result.id ?? '') };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
