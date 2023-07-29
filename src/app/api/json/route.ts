import { NextResponse } from 'next/server';
import currencies from '../data/currencies.json';
import parameters from '../data/parameters.json';
import paymentMethods from '../data/paymentMethods.json';
import products from '../data/products.json';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('fileName');
    switch (fileName) {
        case 'currency':
            return NextResponse.json(currencies);
        case 'parameters':
            return NextResponse.json(parameters);
        case 'paymentMethods':
            return NextResponse.json(paymentMethods);
        case 'products':
            return NextResponse.json(products);
        default:
            return NextResponse.json({});
    }
}
