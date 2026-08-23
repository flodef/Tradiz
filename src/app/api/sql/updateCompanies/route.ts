import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, DbConnection, withTransaction } from '../db';

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
        const conn = connection;

        const table = conn.isPostgreSQL ? 'dc_pos.companies' : 'companies';
        const isPg = conn.isPostgreSQL;

        await withTransaction(conn, async () => {
            // Fetch existing companies (id, name) so we can preserve IDs on rename.
            // Categories reference companies via company_id FK, so deleting + re-inserting
            // would break those links. We match by id when available, by name as fallback.
            const [existingRows] = (await conn.execute(`SELECT id, name FROM ${table}`)) as {
                id: number;
                name: string;
            }[][];
            const existingById = new Map<number, string>();
            const existingByName = new Map<string, number>();
            for (const row of existingRows) {
                existingById.set(Number(row.id), row.name);
                existingByName.set(row.name, Number(row.id));
            }

            const seenIds = new Set<number>();
            const seenNames = new Set<string>();

            for (const company of companies) {
                const name = company.name;
                const mealPrice = company.mealPrice ?? 0;
                seenNames.add(name);

                // If the client provided an id, update that row (preserves FKs on rename)
                if (company.id != null && existingById.has(company.id)) {
                    seenIds.add(company.id);
                    if (isPg) {
                        await conn.execute(`UPDATE ${table} SET name = $1, meal_price = $2 WHERE id = $3`, [
                            name,
                            mealPrice,
                            company.id,
                        ]);
                    } else {
                        await conn.execute(`UPDATE ${table} SET name = ?, meal_price = ? WHERE id = ?`, [
                            name,
                            mealPrice,
                            company.id,
                        ]);
                    }
                } else if (existingByName.has(name)) {
                    // No id from client, but name matches — update existing
                    const existingId = existingByName.get(name)!;
                    seenIds.add(existingId);
                    if (isPg) {
                        await conn.execute(`UPDATE ${table} SET name = $1, meal_price = $2 WHERE id = $3`, [
                            name,
                            mealPrice,
                            existingId,
                        ]);
                    } else {
                        await conn.execute(`UPDATE ${table} SET name = ?, meal_price = ? WHERE id = ?`, [
                            name,
                            mealPrice,
                            existingId,
                        ]);
                    }
                } else {
                    // Insert new company
                    if (isPg) {
                        await conn.execute(`INSERT INTO ${table} (name, meal_price) VALUES ($1, $2)`, [
                            name,
                            mealPrice,
                        ]);
                    } else {
                        await conn.execute(`INSERT INTO ${table} (name, meal_price) VALUES (?, ?)`, [name, mealPrice]);
                    }
                }
            }

            // Delete companies that no longer exist in the new list
            for (const [id, name] of existingById) {
                if (!seenIds.has(id) && !seenNames.has(name)) {
                    if (isPg) {
                        await conn.execute(`DELETE FROM ${table} WHERE id = $1`, [id]);
                    } else {
                        await conn.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
                    }
                }
            }
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating companies:', error);
        return NextResponse.json({ error: 'An error occurred while updating companies' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
