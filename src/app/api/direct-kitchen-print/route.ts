import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const response = await fetch('http://localhost:8082/direct_kitchen_print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            return NextResponse.json({ error: 'Upstream error' }, { status: response.status });
        }
        const text = await response.text();
        try {
            return NextResponse.json(JSON.parse(text));
        } catch {
            return new NextResponse(text);
        }
    } catch (error) {
        console.error('direct-kitchen-print proxy error:', error);
        return NextResponse.json({ error: 'Failed to connect' }, { status: 500 });
    }
}
