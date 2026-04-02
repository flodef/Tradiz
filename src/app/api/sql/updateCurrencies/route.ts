import { NextResponse } from 'next/server';
import { getPosDb } from '../db';
import { Currency } from '@/app/utils/interfaces';

export async function POST(request: Request) {
    try {
        const { currencies } = await request.json();

        if (!currencies || !Array.isArray(currencies)) {
            return NextResponse.json({ error: 'Invalid currencies format' }, { status: 400 });
        }

        const connection = await getPosDb();

        // Check if currency table exists, if not create it
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS currency (
                label VARCHAR(50) PRIMARY KEY,
                symbol VARCHAR(10) NOT NULL,
                max_value DECIMAL(12,4) DEFAULT 999.99,
                decimals INT DEFAULT 2,
                rate DECIMAL(12,6) DEFAULT 1,
                fee DECIMAL(5,2) DEFAULT 0
            ) ENGINE=InnoDB;
        `);

        // Transactional update: clear and re-insert
        // Alternative: use INSERT ... ON DUPLICATE KEY UPDATE
        
        // For simplicity and to handle deletions, we can clear and re-insert 
        // OR better: handle them one by one.
        
        // Let's use a simple approach: delete all and insert all
        await connection.execute('DELETE FROM currency');

        for (const currency of currencies as Currency[]) {
            const query = `
                INSERT INTO currency (label, symbol, max_value, decimals, rate, fee)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            await connection.execute(query, [
                currency.label,
                currency.symbol,
                currency.maxValue,
                currency.decimals,
                currency.rate,
                currency.fee,
            ]);
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating currencies' }, { status: 500 });
    }
}
