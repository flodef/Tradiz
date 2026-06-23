import { getMainDb } from '../src/app/api/sql/db';
import { generateProductReference } from '../src/app/utils/productReference';

/**
 * Script to update all products with null references
 *
 * This script:
 * 1. Connects to the main database
 * 2. Finds all products with null or empty references
 * 3. Generates EAN-13 compatible references for each product
 * 4. Updates the products in the database
 *
 * Usage: bun run scripts/update-product-references.ts
 */

async function updateProductReferences() {
    console.log('🔄 Starting product reference update...');

    try {
        const connection = await getMainDb();

        // Get all products with null or empty references
        const selectQuery = connection.isPostgreSQL
            ? "SELECT id, sort_order FROM dc.products WHERE reference IS NULL OR reference = '' ORDER BY id"
            : "SELECT id, sort_order FROM products WHERE reference IS NULL OR reference = '' ORDER BY id";

        const [rows] = await connection.execute(selectQuery);
        const products = rows as { id: number; sort_order: number }[];

        if (products.length === 0) {
            console.log('✅ No products with null references found.');
            await connection.end();
            return;
        }

        console.log(`📦 Found ${products.length} products with null references.`);

        let updatedCount = 0;

        for (const product of products) {
            const reference = generateProductReference(product.sort_order || product.id);

            const updateQuery = connection.isPostgreSQL
                ? 'UPDATE dc.products SET reference = $1 WHERE id = $2'
                : 'UPDATE products SET reference = ? WHERE id = ?';

            await connection.execute(updateQuery, [reference, product.id]);
            updatedCount++;

            console.log(`  ✅ Updated product ID ${product.id} with reference: ${reference}`);
        }

        await connection.end();

        console.log(`\n✨ Successfully updated ${updatedCount} product references.`);
    } catch (error) {
        console.error('❌ Error updating product references:', error);
        process.exit(1);
    }
}

// Run the script
updateProductReferences();
