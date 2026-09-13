import { NextResponse } from 'next/server';
import { pushInvoiceToPennyLane, type PushToPennyLaneInput } from '@/app/actions/pennylane';
import type { BillingReport } from '@/app/utils/interfaces';
import type { Shop } from '@/app/contexts/ConfigProvider';
import { getShopIdFromRequest } from '@/app/constants/shop';
import { getPosDb } from '../../sql/db';
import { readSubscription, stoppedSubscriptionResponse } from '../../sql/subscriptionStore';
import { SUBSCRIPTION_PLANS } from '@/app/utils/subscription';

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const body = await request.json();
        const { report, shop, invoiceNumber, deadline } = body as {
            report: BillingReport;
            shop: Shop;
            invoiceNumber: string;
            deadline?: string;
        };

        if (!report || !shop || !invoiceNumber) {
            return NextResponse.json({ error: 'Missing report, shop, or invoiceNumber' }, { status: 400 });
        }

        // Read the PennyLane token from the parameters table so it never transits the client.
        let pennylaneToken: string | undefined;
        const connection = await getPosDb(shopId);
        try {
            // Company invoicing is a Privilège feature with an external side effect.
            const sub = await readSubscription(connection);
            if (sub.status === 'stopped') return stoppedSubscriptionResponse();
            if (!SUBSCRIPTION_PLANS[sub.plan].limits.companies) {
                return NextResponse.json(
                    { error: 'La facturation entreprise nécessite la formule Privilège.' },
                    { status: 403 }
                );
            }
            const isPg = connection.isPostgreSQL;
            const prefix = isPg ? 'dc_pos.' : '';
            const query = isPg
                ? `SELECT param_value FROM ${prefix}parameters WHERE param_key = $1`
                : `SELECT param_value FROM parameters WHERE param_key = ?`;
            const [rows] = await connection.execute(query, ['pennylaneToken']);
            pennylaneToken = (rows as { param_value: string }[])[0]?.param_value || undefined;
        } finally {
            await connection.end();
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
