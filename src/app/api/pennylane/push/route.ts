import { NextResponse } from 'next/server';
import { pushInvoiceToPennyLane, type PushToPennyLaneInput } from '@/app/actions/pennylane';
import type { BillingReport } from '@/app/utils/interfaces';
import type { Shop } from '@/app/contexts/ConfigProvider';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { report, shop, invoiceNumber, deadline, pennylaneToken } = body as {
            report: BillingReport;
            shop: Shop;
            invoiceNumber: string;
            deadline?: string;
            pennylaneToken?: string;
        };

        if (!report || !shop || !invoiceNumber) {
            return NextResponse.json({ error: 'Missing report, shop, or invoiceNumber' }, { status: 400 });
        }

        const input: PushToPennyLaneInput = { report, shop, invoiceNumber, deadline, pennylaneToken };
        const result = await pushInvoiceToPennyLane(input);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ success: true, invoiceId: result.invoiceId });
    } catch (error) {
        console.error('PennyLane push error:', error);
        return NextResponse.json({ error: 'An error occurred while pushing to PennyLane' }, { status: 500 });
    }
}
