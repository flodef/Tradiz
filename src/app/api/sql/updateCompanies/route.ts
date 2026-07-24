import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface Company {
    id?: number;
    name: string;
    mealPrice: number;
}

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const { companies } = (await request.json()) as { companies: Company[] };

        if (!Array.isArray(companies)) {
            return NextResponse.json({ error: 'Invalid companies data' }, { status: 400 });
        }

        const connection = await getPosDb(shopId);

        // Delete all existing companies
        const deleteQuery = connection.isPostgreSQL ? 'DELETE FROM dc_pos.companies' : 'DELETE FROM companies';
        await connection.execute(deleteQuery);

        // Insert new companies
        for (const company of companies) {
            const name = company.name;
            const mealPrice = company.mealPrice ?? 0;

            if (connection.isPostgreSQL) {
                const insertQuery = `
                    INSERT INTO dc_pos.companies (name, meal_price)
                    VALUES ($1, $2)
                `;
                await connection.execute(insertQuery, [name, mealPrice]);
            } else {
                const insertQuery = `
                    INSERT INTO companies (name, meal_price)
                    VALUES (?, ?)
                `;
                await connection.execute(insertQuery, [name, mealPrice]);
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating companies:', error);
        return NextResponse.json({ error: 'An error occurred while updating companies' }, { status: 500 });
    }
}
