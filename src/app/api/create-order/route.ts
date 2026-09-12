import { NextRequest, NextResponse } from 'next/server';

const REVOLUT_API_URL =
    process.env.REVOLUT_MODE === 'prod'
        ? 'https://merchant.revolut.com/api/orders'
        : 'https://sandbox-merchant.revolut.com/api/orders';

export async function POST(request: NextRequest) {
    try {
        const { planName, amount, currency, customerEmail } = await request.json();

        if (!planName || !amount) {
            return NextResponse.json({ error: 'Missing planName or amount' }, { status: 400 });
        }

        if (!process.env.REVOLUT_SECRET_KEY) {
            return NextResponse.json(
                { error: 'Revolut not configured. Set REVOLUT_SECRET_KEY env var.' },
                { status: 503 }
            );
        }

        const response = await fetch(REVOLUT_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.REVOLUT_SECRET_KEY}`,
            },
            body: JSON.stringify({
                amount: Math.round(amount * 100),
                currency: currency || 'EUR',
                description: `Abonnement Tradiz — ${planName}`,
                redirect_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://tradiz.fr'}/checkout?status=success`,
                customer: customerEmail ? { email: customerEmail } : undefined,
                merchant_order_data: {
                    reference: `TRZ-${planName}-${Date.now()}`,
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
