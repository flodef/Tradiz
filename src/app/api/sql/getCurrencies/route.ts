import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

export interface CurrencyRow {
    label: string;
    symbol: string;
    max_value: number | null;
    decimals: number | null;
    rate: number | null;
    fee: number | null;
}

const defaultCurrencies = [{ label: 'Euro', maxValue: 999.99, symbol: '€', decimals: 2, rate: 1, fee: 0 }];

export async function GET() {
    try {
        const connection = await getPosDb();

        // Try to query with all columns first (MariaDB schema)
        // If it fails, fall back to basic columns (PostgreSQL schema)
        let rows;
        try {
            [rows] = await connection.execute('SELECT label, symbol, max_value, decimals, rate, fee FROM currencies');
        } catch {
            // PostgreSQL schema only has label and symbol
            [rows] = await connection.execute('SELECT label, symbol FROM currencies');
        }
        await connection.end();

        const currencyRows = rows as CurrencyRow[];
        if (!currencyRows.length) return NextResponse.json({ currencies: defaultCurrencies }, { status: 200 });

        const currencies = currencyRows.map((row) => ({
            label: row.label,
            maxValue: row.max_value ?? 999.99,
            symbol: row.symbol,
            decimals: row.decimals ?? 2,
            rate: row.rate ?? 1,
            fee: row.fee ?? 0,
        }));

        return NextResponse.json({ currencies }, { status: 200 });
    } catch (error) {
        console.error('Error fetching currencies:', error);
        return NextResponse.json({ currencies: defaultCurrencies }, { status: 200 });
    }
}
