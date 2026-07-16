import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface PrinterRow {
    name: string;
    ip_address: string;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const connection = await getPosDb(shopId);

        // Compat schema: if note_enabled exists, only expose printers enabled for note tickets.
        // Check if column exists (works for both MySQL and PostgreSQL)
        let hasNoteEnabled = false;
        try {
            // Try PostgreSQL syntax first
            const [checkCols] = await connection.execute(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'printers' AND column_name = 'note_enabled'
            `);
            hasNoteEnabled = Array.isArray(checkCols) && checkCols.length > 0;
        } catch {
            // Fallback to MySQL syntax
            try {
                const [columns] = await connection.execute("SHOW COLUMNS FROM printers LIKE 'note_enabled'");
                hasNoteEnabled = Array.isArray(columns) && columns.length > 0;
            } catch {
                hasNoteEnabled = false;
            }
        }

        const query = hasNoteEnabled
            ? `
                SELECT name, ip_address
                FROM printers
                WHERE note_enabled = true
            `
            : `
                SELECT name, ip_address
                FROM printers
            `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const printers = (rows as PrinterRow[]).map((row) => ({
            label: String(row.name),
            ipAddress: String(row.ip_address),
        }));

        return NextResponse.json({ printers }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
