import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface Category {
    label: string;
    vat: number;
    _originalLabel?: string;
}

export async function POST(request: Request) {
    try {
        const { categories } = await request.json();

        if (!categories || !Array.isArray(categories)) {
            return NextResponse.json({ error: 'Invalid categories format' }, { status: 400 });
        }

        const connection = await getMainDb();
        const categoryList = categories as Category[];

        // Renames: update products.category_id before deleting categories
        const renames = categoryList.filter((c) => c._originalLabel && c._originalLabel !== c.label);

        if (connection.isPostgreSQL) {
            await connection.execute('BEGIN');
            try {
                // Update product references for renamed categories
                for (const cat of renames) {
                    await connection.execute('UPDATE dc.products SET category_id = $1 WHERE category_id = $2', [
                        cat.label,
                        cat._originalLabel,
                    ]);
                }

                // Delete all categories and re-insert
                await connection.execute('DELETE FROM dc.categories');
                for (let i = 0; i < categoryList.length; i++) {
                    const category = categoryList[i];
                    await connection.execute(
                        'INSERT INTO dc.categories (name, default_vat_rate, sort_order) VALUES ($1, $2, $3)',
                        [category.label, category.vat, i + 1]
                    );
                }
                await connection.execute('COMMIT');
            } catch (e) {
                await connection.execute('ROLLBACK');
                throw e;
            }
        } else {
            await connection.execute('START TRANSACTION');
            try {
                // Update product references for renamed categories
                for (const cat of renames) {
                    await connection.execute('UPDATE products SET category_id = ? WHERE category_id = ?', [
                        cat.label,
                        cat._originalLabel,
                    ]);
                }

                // Delete all categories and re-insert
                await connection.execute('DELETE FROM categories');
                for (let i = 0; i < categoryList.length; i++) {
                    const category = categoryList[i];
                    await connection.execute(
                        'INSERT INTO categories (name, default_vat_rate, sort_order) VALUES (?, ?, ?)',
                        [category.label, category.vat, i + 1]
                    );
                }
                await connection.execute('COMMIT');
            } catch (e) {
                await connection.execute('ROLLBACK');
                throw e;
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating categories' }, { status: 500 });
    }
}
