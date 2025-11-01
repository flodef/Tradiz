import { NextResponse } from 'next/server';
import discounts from '../../data/discounts.json';

export async function GET() {
    try {
        // No discounts table in DB schema, return default data
        return NextResponse.json(discounts, { status: 200 });
    } catch (error) {
        console.error('Error fetching discounts:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
