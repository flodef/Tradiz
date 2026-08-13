import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb, DbConnection } from '../db';

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
        // JOIN printers to resolve printer_id → printer name
        const query = connection.isPostgreSQL
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

        const [rows] = await connection.execute(query);
        const categories = (rows as CategoryRow[]).map((row) => ({
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
