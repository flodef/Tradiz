import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb, DbConnection } from '../db';

interface CategoryInput {
    id?: number;
    name: string;
    company?: string | null;
    sortOrder?: number;
    originalName?: string;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { categories } = (await request.json()) as { categories: CategoryInput[] };

        if (!Array.isArray(categories)) {
            return NextResponse.json({ error: 'Invalid categories data' }, { status: 400 });
        }

        connection = await getMainDb(shopId);

        const pgTable = connection.isPostgreSQL ? 'dc.categories' : 'categories';
        const pgCompanies = connection.isPostgreSQL ? 'dc_pos.companies' : '`DC_POS`.companies';

        // Fetch all companies (name → id) so we can resolve company names to IDs
        const [companyRows] = await connection.execute(`SELECT id, name FROM ${pgCompanies}`);
        const companyIdByName = new Map<string, number>();
        for (const row of companyRows as { id: number; name: string }[]) {
            companyIdByName.set(row.name, Number(row.id));
        }

        await connection.beginTransaction();
        try {
            // Fetch existing categories
            const [existingRows] = await connection.execute(`SELECT id, name, sort_order FROM ${pgTable}`);
            const existing = existingRows as { id: number; name: string; sort_order: number }[];

            // Build lookup maps
            const existingByName = new Map<string, (typeof existing)[number]>();
            for (const row of existing) {
                existingByName.set(row.name, row);
            }

            const inputNames = new Set(categories.map((c) => c.name));

            // 1. Delete categories that are no longer in the input.
            //    Categories that were renamed have originalName — don't delete those.
            //    The FK on products has ON DELETE SET NULL, so this is safe.
            const renamedOriginals = new Set(
                categories.filter((c) => c.originalName && c.originalName !== c.name).map((c) => c.originalName!)
            );
            for (const row of existing) {
                if (!inputNames.has(row.name) && !renamedOriginals.has(row.name)) {
                    if (connection.isPostgreSQL) {
                        await connection.execute(`DELETE FROM ${pgTable} WHERE id = $1`, [row.id]);
                    } else {
                        await connection.execute(`DELETE FROM ${pgTable} WHERE id = ?`, [row.id]);
                    }
                }
            }

            // 2. Update existing categories and insert new ones
            for (let i = 0; i < categories.length; i++) {
                const cat = categories[i];
                const name = cat.name;
                const companyName = cat.company ?? null;
                const companyId = companyName ? companyIdByName.get(companyName) ?? null : null;
                const sortOrder = cat.sortOrder ?? i;

                // Look up by originalName if renamed, otherwise by name
                const lookupName = cat.originalName ?? name;
                const existingCat = existingByName.get(lookupName);
                if (existingCat) {
                    // Update in place — preserves the id so product FKs stay valid
                    if (connection.isPostgreSQL) {
                        await connection.execute(
                            `UPDATE ${pgTable} SET name = $1, company_id = $2, sort_order = $3 WHERE id = $4`,
                            [name, companyId, sortOrder, existingCat.id]
                        );
                    } else {
                        await connection.execute(
                            `UPDATE ${pgTable} SET name = ?, company_id = ?, sort_order = ? WHERE id = ?`,
                            [name, companyId, sortOrder, existingCat.id]
                        );
                    }
                } else {
                    // Insert new category
                    if (connection.isPostgreSQL) {
                        await connection.execute(
                            `INSERT INTO ${pgTable} (name, company_id, sort_order) VALUES ($1, $2, $3)`,
                            [name, companyId, sortOrder]
                        );
                    } else {
                        await connection.execute(
                            `INSERT INTO ${pgTable} (name, company_id, sort_order) VALUES (?, ?, ?)`,
                            [name, companyId, sortOrder]
                        );
                    }
                }
            }

            await connection.commit();
        } catch (e) {
            await connection.rollback();
            throw e;
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating categories:', error);
        return NextResponse.json({ error: 'An error occurred while updating categories' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
