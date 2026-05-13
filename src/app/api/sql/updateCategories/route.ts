import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface Category {
    label: string;
    vat: number;
    _originalLabel?: string;
}

export async function POST(request: Request) {
    try {
        const { categories, originalCategories } = await request.json();

        if (!categories || !Array.isArray(categories)) {
            return NextResponse.json({ error: 'Invalid categories format' }, { status: 400 });
        }

        const connection = await getMainDb();
        const categoryList = categories as Category[];
        const originalList = (originalCategories || []) as Category[];

        // Collect all original names that should still exist (either kept or renamed)
        const keptOriginalNames = new Set(categoryList.map((c) => c._originalLabel).filter((n): n is string => !!n));
        // Delete categories whose original name is no longer referenced
        const namesToDelete = originalList.map((c) => c.label).filter((name) => name && !keptOriginalNames.has(name));

        if (namesToDelete.length > 0) {
            if (connection.isPostgreSQL) {
                const placeholders = namesToDelete.map((_, i) => `$${i + 1}`).join(', ');
                await connection.execute(`DELETE FROM dc.categories WHERE name IN (${placeholders})`, namesToDelete);
            } else {
                const placeholders = namesToDelete.map(() => '?').join(', ');
                await connection.execute(`DELETE FROM categories WHERE name IN (${placeholders})`, namesToDelete);
            }
        }

        // Renames: categories where _originalLabel differs from label (and _originalLabel is non-empty)
        const renames = categoryList.filter((c) => c._originalLabel && c._originalLabel !== c.label);

        // Apply renames via temp name to avoid unique constraint conflicts
        for (const cat of renames) {
            const tempName = `__temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            if (connection.isPostgreSQL) {
                await connection.execute('UPDATE dc.categories SET name = $1 WHERE name = $2', [
                    tempName,
                    cat._originalLabel,
                ]);
                await connection.execute('UPDATE dc.categories SET name = $1 WHERE name = $2', [cat.label, tempName]);
            } else {
                await connection.execute('UPDATE categories SET name = ? WHERE name = ?', [
                    tempName,
                    cat._originalLabel,
                ]);
                await connection.execute('UPDATE categories SET name = ? WHERE name = ?', [cat.label, tempName]);
            }
        }

        // Update sort_order and vat for all categories, insert new ones
        for (let i = 0; i < categoryList.length; i++) {
            const category = categoryList[i];
            const sortOrder = i + 1;

            if (connection.isPostgreSQL) {
                const [existing] = await connection.execute('SELECT id FROM dc.categories WHERE name = $1', [
                    category.label,
                ]);
                const rows = existing as { id: number }[];

                if (rows.length > 0) {
                    await connection.execute(
                        'UPDATE dc.categories SET default_vat_rate = $1, sort_order = $2 WHERE name = $3',
                        [category.vat, sortOrder, category.label]
                    );
                } else {
                    await connection.execute(
                        'INSERT INTO dc.categories (name, default_vat_rate, sort_order) VALUES ($1, $2, $3)',
                        [category.label, category.vat, sortOrder]
                    );
                }
            } else {
                const [existing] = await connection.execute('SELECT id FROM categories WHERE name = ?', [
                    category.label,
                ]);
                const rows = existing as { id: number }[];

                if (rows.length > 0) {
                    await connection.execute(
                        'UPDATE categories SET default_vat_rate = ?, sort_order = ? WHERE name = ?',
                        [category.vat, sortOrder, category.label]
                    );
                } else {
                    await connection.execute(
                        'INSERT INTO categories (name, default_vat_rate, sort_order) VALUES (?, ?, ?)',
                        [category.label, category.vat, sortOrder]
                    );
                }
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Database update error:', error);
        return NextResponse.json({ error: 'An error occurred while updating categories' }, { status: 500 });
    }
}
