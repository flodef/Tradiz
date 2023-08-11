import { NextResponse } from 'next/server';
import currencies from '../data/currencies.json';
import parameters from '../data/parameters.json';
import paymentMethods from '../data/paymentMethods.json';
import products from '../data/products.json';
import users from '../data/users.json';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('fileName');
    switch (fileName) {
        case 'currencies':
            return NextResponse.json(currencies);
        case 'parameters':
            return NextResponse.json(parameters);
        case 'paymentMethods':
            return NextResponse.json(paymentMethods);
        case 'products':
            return NextResponse.json(products);
        case 'users':
            return NextResponse.json(users);
        default:
            return NextResponse.json({});
    }
}
