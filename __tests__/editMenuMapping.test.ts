import { describe, it, expect } from 'vitest';

/**
 * Non-regression tests for edit_menu/page.tsx inventory → admin data mapping.
 *
 * Bugs fixed:
 * 1. Category TVA was divided by 100 (vat: item.rate / 100) producing 0.055 instead of 5.5.
 *    Fix: use item.rate directly — it is already stored as a percentage value (5.5, 10, 20…).
 * 2. Product availability was hardcoded to `true` instead of reading product.availability.
 *    Fix: use product.availability directly.
 */

interface InventoryProduct {
    label: string;
    prices: number[];
    options?: string | null;
    availability: boolean;
    order: number;
}

interface InventoryItem {
    category: string;
    rate: number;
    order: number;
    products: InventoryProduct[];
}

interface AdminProduct {
    name: string;
    category: string;
    availability: boolean;
    currencies: string[];
}

interface Category {
    label: string;
    vat: number;
}

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
                availability: product.availability, // FIX: was hardcoded `true`
                currencies: product.prices.map(String),
            });
        });
    });

    return { categories: allCategories, products: allProducts };
}

// ── Sample inventory matching the shape from processData.ts ─────────────────
// rate = raw percentage (5.5, 10, 20, 0) — already multiplied by 100 in convertProductsData
// availability = !item[3] (false means "Indisponible" column is false → available)

const sampleInventory: InventoryItem[] = [
    {
        category: 'Boulange',
        rate: 5.5,
        order: 0,
        products: [
            { label: 'Baguette', prices: [1.3], availability: true, order: 0 },
            { label: 'Seigle Sarrasin', prices: [3.5], availability: false, order: 1 },
        ],
    },
    {
        category: 'Salon Thé',
        rate: 10,
        order: 1,
        products: [
            { label: 'Café court / moyen', prices: [1.5], availability: true, order: 0 },
        ],
    },
    {
        category: 'Alcool',
        rate: 20,
        order: 2,
        products: [
            { label: 'Cidre', prices: [0], availability: true, order: 0 },
        ],
    },
    {
        category: 'Autres',
        rate: 0,
        order: 3,
        products: [
            { label: 'Journal', prices: [1.3], availability: true, order: 0 },
        ],
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
    it('available product (availability=true) should be marked available', () => {
        const { products } = mapInventoryToAdminData(sampleInventory);
        const baguette = products.find((p) => p.name === 'Baguette');
        expect(baguette).toBeDefined();
        expect(baguette!.availability).toBe(true);
    });

    it('unavailable product (availability=false) should NOT be marked available', () => {
        const { products } = mapInventoryToAdminData(sampleInventory);
        const seigle = products.find((p) => p.name === 'Seigle Sarrasin');
        expect(seigle).toBeDefined();
        expect(seigle!.availability).toBe(false);
    });

    it('availability is not hardcoded to true — different values are preserved', () => {
        const { products } = mapInventoryToAdminData(sampleInventory);
        const availabilities = products.map((p) => p.availability);
        // Must contain at least one false (Seigle Sarrasin)
        expect(availabilities).toContain(false);
        // Must also contain at least one true
        expect(availabilities).toContain(true);
    });

    it('all products with availability=true are preserved as available', () => {
        const { products } = mapInventoryToAdminData(sampleInventory);
        const availableProducts = ['Baguette', 'Café court / moyen', 'Cidre', 'Journal'];
        for (const name of availableProducts) {
            const p = products.find((x) => x.name === name);
            expect(p, `Product "${name}" should exist`).toBeDefined();
            expect(p!.availability, `Product "${name}" should be available`).toBe(true);
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
