import { NextResponse } from 'next/server';
import currencies from '../../data/currencies.json';
import { getPosDb } from '../db';

interface CurrencyRow {
    label: string;
    symbol: string;
    max_value: number | null;
    decimals: number | null;
}

export async function GET() {
    try {
        const connection = await getPosDb();
        const [rows] = await connection.execute('SELECT label, symbol, max_value, decimals FROM currency');
        await connection.end();

        const currencyRows = rows as CurrencyRow[];
        if (!currencyRows.length) return NextResponse.json(currencies, { status: 200 });

        // Return in the same values[][] shape that convertCurrenciesData expects:
        // header row + data rows: [label, maxValue, symbol, decimals]
        const values = [
            ['Intitulé (Symbole)', 'Valeur maximale', 'Symbole', 'Décimales'],
            ...currencyRows.map((row) => [row.label, row.max_value ?? 999.99, row.symbol, row.decimals ?? 2]),
        ];

        return NextResponse.json({ values }, { status: 200 });
    } catch (error) {
        console.error('Error fetching currencies:', error);
        return NextResponse.json(currencies, { status: 200 });
    }
}
