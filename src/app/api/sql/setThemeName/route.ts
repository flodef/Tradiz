import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    try {
        const { name } = await request.json();

        if (!name || typeof name !== 'string') {
            return NextResponse.json({ error: 'Invalid theme name' }, { status: 400 });
        }

        const connection = await getMainDb(shopId);

        const query = connection.isPostgreSQL
            ? `
            UPDATE theme_admin
            SET name = $1
            WHERE selected = true
        `
            : `
            UPDATE theme_admin
            SET name = ?
            WHERE selected = true
        `;

        await connection.execute(query, [name]);
        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating theme name:', error);
        return NextResponse.json({ error: 'An error occurred while updating theme name' }, { status: 500 });
    }
}
