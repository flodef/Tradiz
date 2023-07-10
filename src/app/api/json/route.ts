import { NextResponse } from 'next/server';
import parameters from '../../data/parameters.json';
import products from '../../data/products.json';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('fileName');
    switch (fileName) {
        case 'parameters':
            return NextResponse.json(parameters);
        case 'products':
            return NextResponse.json(products);
        default:
            return null;
    }
}
