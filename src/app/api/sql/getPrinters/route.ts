import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface PrinterRow {
    name: string;
    ip_address: string;
}

export async function GET() {
    try {
        const connection = await getPosDb();

                // Compat schema: if note_enabled exists, only expose printers enabled for note tickets.
                const [columns] = await connection.execute("SHOW COLUMNS FROM printers LIKE 'note_enabled'");
                const hasNoteEnabled = Array.isArray(columns) && columns.length > 0;

                const query = hasNoteEnabled
                        ? `
                                SELECT name, ip_address
                                FROM printers
                                WHERE note_enabled = 1
                            `
                        : `
                                SELECT name, ip_address
                                FROM printers
                            `;

                const [rows] = await connection.execute(query);
        await connection.end();

        const data: { values: string[][] } = { values: [] };
        data.values.push(['Nom', 'Adresse IP']);
        data.values.push(...(rows as PrinterRow[]).map((row): string[] => [String(row.name), String(row.ip_address)]));

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
