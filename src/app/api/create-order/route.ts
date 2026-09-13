import { NextRequest, NextResponse } from 'next/server';
import { SUBSCRIPTION_PLANS } from '@/app/utils/subscription';

const REVOLUT_API_URL =
    process.env.REVOLUT_MODE === 'prod'
        ? 'https://merchant.revolut.com/api/orders'
        : 'https://sandbox-merchant.revolut.com/api/orders';

export async function POST(request: NextRequest) {
    try {
        const { planName, billing, customerEmail } = await request.json();

        if (!planName || typeof planName !== 'string') {
            return NextResponse.json({ error: 'Missing or invalid planName' }, { status: 400 });
        }

        // Find the plan by name (case-insensitive) — prices come from the
        // shared plan definitions; the client must never control the amount.
        const plan = Object.values(SUBSCRIPTION_PLANS).find((p) => p.name.toLowerCase() === planName.toLowerCase());
        if (!plan) {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }

        // Subscriptions are monthly only — annual prepayment no longer exists.
        if (billing !== 'monthly') {
            return NextResponse.json({ error: 'Invalid billing period' }, { status: 400 });
        }
        const amount = Math.round(plan.monthlyPrice * 100);
        if (!amount || amount <= 0) {
            return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
        }

        if (!process.env.REVOLUT_SECRET_KEY) {
            return NextResponse.json(
                { error: 'Revolut not configured. Set REVOLUT_SECRET_KEY env var.' },
                { status: 503 }
            );
        }

        // Validate email if provided
        if (
            customerEmail &&
            (typeof customerEmail !== 'string' ||
                customerEmail.length > 254 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))
        ) {
            return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
        }

        const response = await fetch(REVOLUT_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.REVOLUT_SECRET_KEY}`,
            },
            body: JSON.stringify({
                amount,
                currency: 'EUR',
                description: `Abonnement Tradiz — ${plan.name}`,
                redirect_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://tradiz.fr'}/checkout?status=success`,
                customer: customerEmail ? { email: customerEmail } : undefined,
                merchant_order_data: {
                    reference: `TRZ-${plan.name}-${Date.now()}`,
                },
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Revolut API error:', error);
            return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
        }

        const order = await response.json();
        return NextResponse.json({
            token: order.token,
            orderId: order.id,
            checkoutUrl: order.checkout_url,
        });
    } catch (error) {
        console.error('Error creating Revolut order:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
