import { NextRequest, NextResponse } from 'next/server';

const REVOLUT_API_URL =
    process.env.REVOLUT_MODE === 'prod'
        ? 'https://merchant.revolut.com/api/orders'
        : 'https://sandbox-merchant.revolut.com/api/orders';

// Server-side plan definitions — the source of truth for pricing.
// The client must never control the amount; we validate and compute it here.
const SERVER_PLANS: Record<string, { name: string; monthly: number; annual: number }> = {
    decouverte: { name: 'Découverte', monthly: 3000, annual: 30000 },
    pro: { name: 'Pro', monthly: 5000, annual: 50000 },
    privilege: { name: 'Privilège', monthly: 10000, annual: 10000 },
};

export async function POST(request: NextRequest) {
    try {
        const { planName, billing, customerEmail } = await request.json();

        if (!planName || typeof planName !== 'string') {
            return NextResponse.json({ error: 'Missing or invalid planName' }, { status: 400 });
        }

        // Find the plan by name (case-insensitive)
        const plan = Object.values(SERVER_PLANS).find((p) => p.name.toLowerCase() === planName.toLowerCase());
        if (!plan) {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }

        // Compute amount server-side based on billing period
        const isAnnual = billing === 'annual';
        const amount = isAnnual ? plan.annual : plan.monthly;
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
        if (customerEmail && (typeof customerEmail !== 'string' || customerEmail.length > 254)) {
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
