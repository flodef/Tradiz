import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection } from '../db';

interface Company {
    id?: number;
    name: string;
    mealPrice: number;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const { companies } = (await request.json()) as { companies: Company[] };

        if (!Array.isArray(companies)) {
            return NextResponse.json({ error: 'Invalid companies data' }, { status: 400 });
        }

        connection = await getPosDb(shopId);

        const table = connection.isPostgreSQL ? 'dc_pos.companies' : 'companies';

        // Fetch existing companies (id, name) so we can preserve IDs when names match.
        // Categories reference companies via company_id FK, so deleting + re-inserting
        // would break those links. Instead, we UPSERT by name and delete only removed ones.
        const [existingRows] = (await connection.execute(`SELECT id, name FROM ${table}`)) as {
            id: number;
            name: string;
        }[][];
        const existingByName = new Map<string, number>();
        for (const row of existingRows) {
            existingByName.set(row.name, Number(row.id));
        }

        const seenNames = new Set<string>();

        for (const company of companies) {
            const name = company.name;
            const mealPrice = company.mealPrice ?? 0;
            seenNames.add(name);

            const existingId = existingByName.get(name);
            if (existingId !== undefined) {
                // Update existing company (preserves id → category FKs stay valid)
                if (connection.isPostgreSQL) {
                    await connection.execute(`UPDATE ${table} SET name = $1, meal_price = $2 WHERE id = $3`, [
                        name,
                        mealPrice,
                        existingId,
                    ]);
                } else {
                    await connection.execute(`UPDATE ${table} SET name = ?, meal_price = ? WHERE id = ?`, [
                        name,
                        mealPrice,
                        existingId,
                    ]);
                }
            } else {
                // Insert new company
                if (connection.isPostgreSQL) {
                    await connection.execute(`INSERT INTO ${table} (name, meal_price) VALUES ($1, $2)`, [
                        name,
                        mealPrice,
                    ]);
                } else {
                    await connection.execute(`INSERT INTO ${table} (name, meal_price) VALUES (?, ?)`, [
                        name,
                        mealPrice,
                    ]);
                }
            }
        }

        // Delete companies that no longer exist in the new list
        for (const [name, id] of existingByName) {
            if (!seenNames.has(name)) {
                if (connection.isPostgreSQL) {
                    await connection.execute(`DELETE FROM ${table} WHERE id = $1`, [id]);
                } else {
                    await connection.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
                }
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating companies:', error);
        return NextResponse.json({ error: 'An error occurred while updating companies' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
