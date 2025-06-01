import { NextResponse } from 'next/server';
import colors from '../data/colors.json';
import currencies from '../data/currencies.json';
import discounts from '../data/discounts.json';
import parameters from '../data/parameters.json';
import paymentMethods from '../data/paymentMethods.json';
import products from '../data/products.json';
import users from '../data/users.json';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('fileName');
    switch (fileName) {
        case 'colors':
            return NextResponse.json(colors);
        case 'currencies':
            return NextResponse.json(currencies);
        case 'discounts':
            return NextResponse.json(discounts);
        case 'parameters':
            return NextResponse.json(parameters);
        case 'paymentMethods':
            return NextResponse.json(paymentMethods);
        case 'products':
            return NextResponse.json(products);
        case 'users':
            return NextResponse.json(users);
        default:
            console.error(`JSON file name not found: ${fileName}. Add it to json API route.`);
            return NextResponse.json({});
    }
}
