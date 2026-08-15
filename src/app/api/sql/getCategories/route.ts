import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb, DbConnection } from '../db';

export const dynamic = 'force-dynamic';

interface CategoryRow {
    id: number;
    name: string;
    company_name: string | null;
    printer_name: string | null;
    sort_order: number;
}

export interface CategoryData {
    id: number;
    name: string;
    company: string | null;
    printer: string | null;
    sortOrder: number;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        connection = await getMainDb(shopId);

        // JOIN companies to resolve company_id → company name
        // JOIN printers to resolve printer_id → printer name (if column exists)
        const queryWithPrinter = connection.isPostgreSQL
            ? `SELECT c.id, c.name, comp.name as company_name, prt.name as printer_name, c.sort_order
               FROM dc.categories c
               LEFT JOIN dc_pos.companies comp ON c.company_id = comp.id
               LEFT JOIN dc_pos.printers prt ON c.printer_id = prt.id
               ORDER BY c.sort_order ASC, c.id ASC`
            : `SELECT c.id, c.name, comp.name as company_name, prt.name as printer_name, c.sort_order
               FROM categories c
               LEFT JOIN \`DC_POS\`.companies comp ON c.company_id = comp.id
               LEFT JOIN printers prt ON c.printer_id = prt.id
               ORDER BY c.sort_order ASC, c.id ASC`;

        const queryWithoutPrinter = connection.isPostgreSQL
            ? `SELECT c.id, c.name, comp.name as company_name, NULL as printer_name, c.sort_order
               FROM dc.categories c
               LEFT JOIN dc_pos.companies comp ON c.company_id = comp.id
               ORDER BY c.sort_order ASC, c.id ASC`
            : `SELECT c.id, c.name, comp.name as company_name, NULL as printer_name, c.sort_order
               FROM categories c
               LEFT JOIN \`DC_POS\`.companies comp ON c.company_id = comp.id
               ORDER BY c.sort_order ASC, c.id ASC`;

        let rows: CategoryRow[];
        try {
            [rows] = (await connection.execute(queryWithPrinter)) as CategoryRow[][];
        } catch {
            // printer_id column may not exist yet — fall back without it
            [rows] = (await connection.execute(queryWithoutPrinter)) as CategoryRow[][];
        }

        const categories = rows.map((row) => ({
            id: Number(row.id),
            name: String(row.name),
            company: row.company_name ?? null,
            printer: row.printer_name ?? null,
            sortOrder: Number(row.sort_order) || 0,
        }));

        return NextResponse.json({ categories }, { status: 200 });
    } catch (error) {
        console.error('Error fetching categories:', error);
        return NextResponse.json({ categories: [] }, { status: 200 });
    } finally {
        await connection?.end();
    }
}
