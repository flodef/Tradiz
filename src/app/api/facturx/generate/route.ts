import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { generateFacturX, type FacturXInput } from '@/app/actions/facturx';
import type { BillingReport } from '@/app/utils/interfaces';
import type { Shop } from '@/app/contexts/ConfigProvider';

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const body = await request.json();
        const { report, shop, invoiceNumber, currencyCode } = body as {
            report: BillingReport;
            shop: Shop;
            invoiceNumber: string;
            currencyCode?: string;
        };

        if (!report || !shop || !invoiceNumber) {
            return NextResponse.json({ error: 'Missing report, shop, or invoiceNumber' }, { status: 400 });
        }

        const input: FacturXInput = { report, shop, invoiceNumber, currencyCode };
        const result = await generateFacturX(input);

        if (!result.success || !result.data) {
            return NextResponse.json({ error: result.error ?? 'Generation failed' }, { status: 500 });
        }

        const headers = new Headers();
        headers.set('Content-Type', 'application/pdf');
        headers.set('Content-Disposition', `attachment; filename="facture-${invoiceNumber}.pdf"`);

        return new NextResponse(Buffer.from(result.data), { status: 200, headers });
    } catch (error) {
        console.error('Factur-X API error:', error);
        return NextResponse.json({ error: 'An error occurred during Factur-X generation' }, { status: 500 });
    }
}
