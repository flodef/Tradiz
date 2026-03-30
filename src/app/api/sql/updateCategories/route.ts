import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface Category {
    label: string;
    vat: number;
}

export async function POST(request: Request) {
    try {
        const { categories } = await request.json();

        if (!categories || !Array.isArray(categories)) {
            return NextResponse.json({ error: 'Invalid categories format' }, { status: 400 });
        }

        const connection = await getMainDb();

        // Update each category
        for (const category of categories as Category[]) {
            // Note: Categories in the DC database don't have a VAT field in the provided schema
            // If you need to store VAT, you'll need to add a taux_tva column to the categorie table
            const query = `
                UPDATE categorie 
                SET nom = ?
                WHERE nom = ?
            `;
            
            await connection.execute(query, [category.label, category.label]);
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating categories' }, { status: 500 });
    }
}
