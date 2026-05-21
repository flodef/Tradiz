import { AdminProduct } from '@/app/components/admin/sections/ProductsConfig';
import { Category, InventoryItem } from '@/app/utils/interfaces';
import { describe, expect, it } from 'vitest';

/**
 * Non-regression tests for edit_menu/page.tsx inventory → admin data mapping.
 *
 * Bugs fixed:
 * 1. Category TVA was divided by 100 (vat: item.rate / 100) producing 0.055 instead of 5.5.
 *    Fix: use item.rate directly — it is already stored as a percentage value (5.5, 10, 20…).
 * 2. Product availability was hardcoded to `true` instead of reading product.stock.
 *    Fix: use product.stock !== 0 (stock=null means available, stock=0 means unavailable).
 */

function mapInventoryToAdminData(inventory: InventoryItem[]): {
    categories: Category[];
    products: AdminProduct[];
} {
    const allProducts: AdminProduct[] = [];
    const allCategories: Category[] = [];

    inventory.forEach((item) => {
        if (!allCategories.find((c) => c.label === item.category)) {
            allCategories.push({
                label: item.category,
                vat: item.rate, // FIX: was item.rate / 100
            });
        }
        item.products.forEach((product) => {
            allProducts.push({
                name: product.label,
                category: item.category,
                stock: product.stock,
                currencies: product.prices.map(String),
                options: product.options ?? undefined,
            });
        });
    });

    return { categories: allCategories, products: allProducts };
}

// ── Sample inventory matching the shape from processData.ts ─────────────────
// rate = raw percentage (5.5, 10, 20, 0) — already multiplied by 100 in convertProductsData
// stock = null means available (unknown/infinite stock), stock = 0 means unavailable (no stock)

const sampleInventory: InventoryItem[] = [
    {
        category: 'Boulange',
        rate: 5.5,
        order: 0,
        products: [
            { label: 'Baguette', prices: [1.3], stock: null, order: 0 },
            { label: 'Seigle Sarrasin', prices: [3.5], stock: 0, order: 1 },
        ],
    },
    {
        category: 'Salon Thé',
        rate: 10,
        order: 1,
        products: [{ label: 'Café court / moyen', prices: [1.5], stock: null, order: 0 }],
    },
    {
        category: 'Alcool',
        rate: 20,
        order: 2,
        products: [{ label: 'Cidre', prices: [0], stock: null, order: 0 }],
    },
    {
        category: 'Autres',
        rate: 0,
        order: 3,
        products: [{ label: 'Journal', prices: [1.3], stock: null, order: 0 }],
    },
];

// ── Bug 1: Category TVA ──────────────────────────────────────────────────────

describe('Category TVA mapping', () => {
    it('Boulange TVA should be 5.5 (not 0.055)', () => {
        const { categories } = mapInventoryToAdminData(sampleInventory);
        const boulange = categories.find((c) => c.label === 'Boulange');
        expect(boulange).toBeDefined();
        expect(boulange!.vat).toBe(5.5);
    });

    it('Salon Thé TVA should be 10 (not 0.1)', () => {
        const { categories } = mapInventoryToAdminData(sampleInventory);
        const salonThe = categories.find((c) => c.label === 'Salon Thé');
        expect(salonThe).toBeDefined();
        expect(salonThe!.vat).toBe(10);
    });

    it('Alcool TVA should be 20 (not 0.2)', () => {
        const { categories } = mapInventoryToAdminData(sampleInventory);
        const alcool = categories.find((c) => c.label === 'Alcool');
        expect(alcool).toBeDefined();
        expect(alcool!.vat).toBe(20);
    });

    it('Autres TVA should be 0', () => {
        const { categories } = mapInventoryToAdminData(sampleInventory);
        const autres = categories.find((c) => c.label === 'Autres');
        expect(autres).toBeDefined();
        expect(autres!.vat).toBe(0);
    });

    it('TVA value should never be less than 1 for non-zero rates (catches the /100 regression)', () => {
        const { categories } = mapInventoryToAdminData(sampleInventory);
        const nonZero = categories.filter((c) => c.vat !== 0);
        for (const cat of nonZero) {
            expect(cat.vat).toBeGreaterThanOrEqual(1);
        }
    });

    it('each category appears exactly once regardless of how many products it has', () => {
        const { categories } = mapInventoryToAdminData(sampleInventory);
        const labels = categories.map((c) => c.label);
        expect(labels).toHaveLength(new Set(labels).size);
        expect(labels).toContain('Boulange');
        expect(labels).toContain('Salon Thé');
        expect(labels).toContain('Alcool');
        expect(labels).toContain('Autres');
    });
});

// ── Bug 2: Product availability ──────────────────────────────────────────────

describe('Product availability mapping', () => {
    it('available product (stock=null) should have stock=null', () => {
        const { products } = mapInventoryToAdminData(sampleInventory);
        const baguette = products.find((p) => p.name === 'Baguette');
        expect(baguette).toBeDefined();
        expect(baguette!.stock).toBe(null);
    });

    it('unavailable product (stock=0) should have stock=0', () => {
        const { products } = mapInventoryToAdminData(sampleInventory);
        const seigle = products.find((p) => p.name === 'Seigle Sarrasin');
        expect(seigle).toBeDefined();
        expect(seigle!.stock).toBe(0);
    });

    it('stock values are preserved from inventory', () => {
        const { products } = mapInventoryToAdminData(sampleInventory);
        const stocks = products.map((p) => p.stock);
        // Must contain at least one 0 (Seigle Sarrasin with stock=0)
        expect(stocks).toContain(0);
        // Must also contain at least one null (products with stock=null)
        expect(stocks).toContain(null);
    });

    it('all products with stock=null are preserved as null', () => {
        const { products } = mapInventoryToAdminData(sampleInventory);
        const availableProducts = ['Baguette', 'Café court / moyen', 'Cidre', 'Journal'];
        for (const name of availableProducts) {
            const p = products.find((x) => x.name === name);
            expect(p, `Product "${name}" should exist`).toBeDefined();
            expect(p!.stock, `Product "${name}" should have stock=null`).toBe(null);
        }
    });
});

// ── Combined: full mapping correctness ───────────────────────────────────────

describe('Full inventory → admin mapping', () => {
    it('produces the correct number of categories and products', () => {
        const { categories, products } = mapInventoryToAdminData(sampleInventory);
        expect(categories).toHaveLength(4);
        expect(products).toHaveLength(5); // 2 Boulange + 1 Salon Thé + 1 Alcool + 1 Autres
    });

    it('each product carries its category name', () => {
        const { products } = mapInventoryToAdminData(sampleInventory);
        const baguette = products.find((p) => p.name === 'Baguette');
        expect(baguette!.category).toBe('Boulange');
        const cafe = products.find((p) => p.name === 'Café court / moyen');
        expect(cafe!.category).toBe('Salon Thé');
    });

    it('product prices are mapped to string currencies array', () => {
        const { products } = mapInventoryToAdminData(sampleInventory);
        const baguette = products.find((p) => p.name === 'Baguette');
        expect(baguette!.currencies).toEqual(['1.3']);
    });

    it('empty inventory produces empty categories and products', () => {
        const { categories, products } = mapInventoryToAdminData([]);
        expect(categories).toHaveLength(0);
        expect(products).toHaveLength(0);
    });
});

// ── Options mapping ──────────────────────────────────────────────────────────

interface ProductOption {
    value: string;
    price: number;
}

interface ProductOptionGroup {
    type: string;
    options: ProductOption[];
}

describe('Product options mapping', () => {
    it('should map options from inventory to admin product options JSON string', () => {
        // Options are stored as JSON string in the inventory
        const iceCreamOptions: ProductOptionGroup[] = [
            {
                type: 'Scoop',
                options: [
                    { value: '1', price: 3 },
                    { value: '2', price: 5 },
                    { value: '3', price: 6 },
                ],
            },
        ];

        const inventoryWithOptions: InventoryItem[] = [
            {
                category: 'Desserts',
                rate: 10,
                order: 0,
                products: [
                    {
                        label: 'Ice Cream',
                        prices: [3],
                        options: JSON.stringify(iceCreamOptions),
                        stock: null,
                        order: 0,
                    },
                ],
            },
        ];

        const { products } = mapInventoryToAdminData(inventoryWithOptions);
        const iceCream = products.find((p) => p.name === 'Ice Cream');

        expect(iceCream).toBeDefined();
        expect(iceCream!.options).toBeDefined();

        // Parse the JSON string back to verify structure
        const parsedOptions: ProductOptionGroup[] = JSON.parse(iceCream!.options!);
        expect(parsedOptions).toHaveLength(1);
        expect(parsedOptions[0].type).toBe('Scoop');
        expect(parsedOptions[0].options).toHaveLength(3);
        expect(parsedOptions[0].options[0]).toEqual({ value: '1', price: 3 });
        expect(parsedOptions[0].options[1]).toEqual({ value: '2', price: 5 });
        expect(parsedOptions[0].options[2]).toEqual({ value: '3', price: 6 });
    });

    it('should handle products with multiple option groups', () => {
        const pizzaOptions: ProductOptionGroup[] = [
            {
                type: 'Size',
                options: [
                    { value: 'Small', price: 0 },
                    { value: 'Large', price: 5 },
                ],
            },
            {
                type: 'Crust',
                options: [
                    { value: 'Thin', price: 0 },
                    { value: 'Thick', price: 2 },
                ],
            },
        ];

        const inventoryWithMultipleGroups: InventoryItem[] = [
            {
                category: 'Pizza',
                rate: 10,
                order: 0,
                products: [
                    {
                        label: 'Custom Pizza',
                        prices: [10],
                        options: JSON.stringify(pizzaOptions),
                        stock: null,
                        order: 0,
                    },
                ],
            },
        ];

        const { products } = mapInventoryToAdminData(inventoryWithMultipleGroups);
        const pizza = products.find((p) => p.name === 'Custom Pizza');

        expect(pizza).toBeDefined();
        const parsedOptions: ProductOptionGroup[] = JSON.parse(pizza!.options!);
        expect(parsedOptions).toHaveLength(2);
        expect(parsedOptions[0].type).toBe('Size');
        expect(parsedOptions[1].type).toBe('Crust');
    });

    it('should handle products without options (options should be undefined)', () => {
        const inventoryWithoutOptions: InventoryItem[] = [
            {
                category: 'Drinks',
                rate: 20,
                order: 0,
                products: [
                    {
                        label: 'Water',
                        prices: [1.5],
                        stock: null,
                        order: 0,
                    },
                ],
            },
        ];

        const { products } = mapInventoryToAdminData(inventoryWithoutOptions);
        const water = products.find((p) => p.name === 'Water');

        expect(water).toBeDefined();
        expect(water!.options).toBeUndefined();
    });

    it('should handle empty options array', () => {
        const inventoryWithEmptyOptions: InventoryItem[] = [
            {
                category: 'Snacks',
                rate: 10,
                order: 0,
                products: [
                    {
                        label: 'Chips',
                        prices: [2],
                        options: '[]',
                        stock: null,
                        order: 0,
                    },
                ],
            },
        ];

        const { products } = mapInventoryToAdminData(inventoryWithEmptyOptions);
        const chips = products.find((p) => p.name === 'Chips');

        expect(chips).toBeDefined();
        // Empty array should still be preserved
        expect(chips!.options).toBe('[]');
    });

    it('should preserve option value as string (can be number, flavor, or size)', () => {
        const sodaOptions: ProductOptionGroup[] = [
            {
                type: 'Flavor',
                options: [
                    { value: 'Cola', price: 0 },
                    { value: 'Orange', price: 0 },
                    { value: 'Lemon', price: 0.5 },
                ],
            },
            {
                type: 'Size',
                options: [
                    { value: '33cl', price: 0 },
                    { value: '50cl', price: 1 },
                    { value: '1L', price: 2 },
                ],
            },
        ];

        const inventoryWithMixedValues: InventoryItem[] = [
            {
                category: 'Drinks',
                rate: 20,
                order: 0,
                products: [
                    {
                        label: 'Soda',
                        prices: [2],
                        options: JSON.stringify(sodaOptions),
                        stock: null,
                        order: 0,
                    },
                ],
            },
        ];

        const { products } = mapInventoryToAdminData(inventoryWithMixedValues);
        const soda = products.find((p) => p.name === 'Soda');

        expect(soda).toBeDefined();
        const parsedOptions: ProductOptionGroup[] = JSON.parse(soda!.options!);

        // Verify string values are preserved (flavors)
        expect(parsedOptions[0].options[0].value).toBe('Cola');
        expect(parsedOptions[0].options[1].value).toBe('Orange');

        // Verify string values with numbers (sizes)
        expect(parsedOptions[1].options[0].value).toBe('33cl');
        expect(parsedOptions[1].options[2].value).toBe('1L');

        // Verify prices are numbers
        expect(parsedOptions[0].options[2].price).toBe(0.5);
        expect(parsedOptions[1].options[2].price).toBe(2);
    });
});
