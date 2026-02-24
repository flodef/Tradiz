import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/counter-order
 * Proxy vers le backend gsws /counter_order.
 * Crée un panier comptoir en BDD (short_num_order + articles en kitchen_view=1 "En préparation")
 * et broadcast vers l'affichage cuisine.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const response = await fetch('http://localhost:8082/counter_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const text = await response.text();
            return NextResponse.json({ error: text || 'Upstream error' }, { status: response.status });
        }

        const text = await response.text();
        try {
            return NextResponse.json(JSON.parse(text));
        } catch {
            return new NextResponse(text);
        }
    } catch (error) {
        console.error('counter-order proxy error:', error);
        return NextResponse.json({ error: 'Failed to connect to upstream server' }, { status: 500 });
    }
}
