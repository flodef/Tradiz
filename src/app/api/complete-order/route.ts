import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { order_id } = body;

        const response = await fetch('http://localhost:8082/complete_order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ order_id }),
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Upstream server error' }, { status: response.status });
        }

        // Attempt to parse as JSON, fallback to text
        const text = await response.text();
        try {
            const json = JSON.parse(text);
            return NextResponse.json(json);
        } catch {
            return new NextResponse(text);
        }
    } catch (error) {
        console.error('Proxy error:', error);
        return NextResponse.json({ error: 'Failed to connect to upstream server' }, { status: 500 });
    }
}
