import { getMainDb } from '../src/app/api/sql/db';
import { generateProductReference } from '../src/app/utils/productReference';

/**
 * Script to update all products and users with null references
 *
 * This script:
 * 1. Connects to the main database
 * 2. Finds all products with null or empty references
 * 3. Finds all users with null or empty references
 * 4. Generates EAN-13 compatible references for each product
 * 5. Generates EAN-13 compatible references for each user
 * 6. Updates the products and users in the database
 *
 * Usage: bun run scripts/update-references.ts
 */

async function updateReferences() {
    console.log('🔄 Starting reference update...');

    try {
        const connection = await getMainDb();

        // Update products
        console.log('\n📦 Processing products...');
        const productSelectQuery = connection.isPostgreSQL
            ? "SELECT id, sort_order FROM dc.products WHERE reference IS NULL OR reference = '' ORDER BY id"
            : "SELECT id, sort_order FROM products WHERE reference IS NULL OR reference = '' ORDER BY id";

        const [productRows] = await connection.execute(productSelectQuery);
        const products = productRows as { id: number; sort_order: number }[];

        if (products.length === 0) {
            console.log('✅ No products with null references found.');
        } else {
            console.log(`📦 Found ${products.length} products with null references.`);

            for (const product of products) {
                const reference = generateProductReference(product.sort_order || product.id);

                const productUpdateQuery = connection.isPostgreSQL
                    ? 'UPDATE dc.products SET reference = $1 WHERE id = $2'
                    : 'UPDATE products SET reference = ? WHERE id = ?';

                await connection.execute(productUpdateQuery, [reference, product.id]);
                console.log(`  ✅ Updated product ID ${product.id} with reference: ${reference}`);
            }
        }

        // Update users
        console.log('\n👤 Processing users...');
        const userSelectQuery = connection.isPostgreSQL
            ? "SELECT id FROM dc_pos.users WHERE reference IS NULL OR reference = '' ORDER BY id"
            : "SELECT id FROM users WHERE reference IS NULL OR reference = '' ORDER BY id";

        const [userRows] = await connection.execute(userSelectQuery);
        const users = userRows as { id: number }[];

        if (users.length === 0) {
            console.log('✅ No users with null references found.');
        } else {
            console.log(`👤 Found ${users.length} users with null references.`);

            for (const user of users) {
                const reference = generateProductReference(user.id);

                const userUpdateQuery = connection.isPostgreSQL
                    ? 'UPDATE dc_pos.users SET reference = $1 WHERE id = $2'
                    : 'UPDATE users SET reference = ? WHERE id = ?';

                await connection.execute(userUpdateQuery, [reference, user.id]);
                console.log(`  ✅ Updated user ID ${user.id} with reference: ${reference}`);
            }
        }

        await connection.end();

        console.log('\n✨ Successfully updated all references.');
    } catch (error) {
        console.error('❌ Error updating references:', error);
        process.exit(1);
    }
}

// Run the script
updateReferences();
