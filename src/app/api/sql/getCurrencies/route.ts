import { NextResponse } from 'next/server';
import currencies from '../../data/currencies.json';

export async function GET() {
    try {
        // No currencies table in DB schema, return default data
        return NextResponse.json(currencies, { status: 200 });
    } catch (error) {
        console.error('Error fetching currencies:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
