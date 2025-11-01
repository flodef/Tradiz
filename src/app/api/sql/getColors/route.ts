import { NextResponse } from 'next/server';
import colors from '../../data/colors.json';

export async function GET() {
    try {
        // No colors table in DB schema, return default data
        return NextResponse.json(colors, { status: 200 });
    } catch (error) {
        console.error('Error fetching colors:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
