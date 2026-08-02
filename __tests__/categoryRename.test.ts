import { describe, expect, it } from 'vitest';
import {
    applyCategoryDeletionToFormulas,
    isSameCategory,
    normalizeCategory,
    renameFormulaCategory,
} from '@/app/utils/category';
import { DEFAULT_CATEGORY } from '@/app/utils/constants';

// Only the product half of the propagation is mirrored here; the formula half uses the same
// helpers as src/app/admin/edit_menu/page.tsx so the two can never drift apart.
interface TestProduct {
    name: string;
    category: string;
}
interface TestElement {
    name: string;
    category?: string;
}
interface TestFormula {
    name: string;
    mode: 'category' | 'products';
    elements: TestElement[];
}

function renameProducts(products: TestProduct[], oldLabel: string, newLabel: string): TestProduct[] {
    return products.map((p) => (isSameCategory(p.category, oldLabel) ? { ...p, category: newLabel } : p));
}

const renameFormulaElements = renameFormulaCategory<TestElement, TestFormula>;

describe('normalizeCategory', () => {
    it('maps the empty stored category to the default label', () => {
        expect(normalizeCategory('')).toBe(DEFAULT_CATEGORY);
        expect(normalizeCategory('   ')).toBe(DEFAULT_CATEGORY);
        expect(normalizeCategory(null)).toBe(DEFAULT_CATEGORY);
        expect(normalizeCategory(undefined)).toBe(DEFAULT_CATEGORY);
    });

    it('trims but otherwise preserves a real category', () => {
        expect(normalizeCategory('  Boissons ')).toBe('Boissons');
    });
});

describe('isSameCategory', () => {
    it('treats the empty string and the default label as the same category', () => {
        expect(isSameCategory('', DEFAULT_CATEGORY)).toBe(true);
        expect(isSameCategory(DEFAULT_CATEGORY, '')).toBe(true);
        expect(isSameCategory(undefined, DEFAULT_CATEGORY)).toBe(true);
    });

    it('ignores capitalization drift from toFirstUpperCase normalization', () => {
        expect(isSameCategory('boissons', 'Boissons')).toBe(true);
    });

    it('still distinguishes different categories', () => {
        expect(isSameCategory('Boissons', 'Desserts')).toBe(false);
        expect(isSameCategory('', 'Boissons')).toBe(false);
    });
});

describe('category rename propagation', () => {
    it('renames products stored under the default (empty) category', () => {
        const products: TestProduct[] = [
            { name: 'Café', category: '' },
            { name: 'Thé', category: 'Boissons' },
        ];
        const result = renameProducts(products, DEFAULT_CATEGORY, 'Chaud');
        expect(result).toEqual([
            { name: 'Café', category: 'Chaud' },
            { name: 'Thé', category: 'Boissons' },
        ]);
    });

    it('renames products stored under the literal default label', () => {
        const products: TestProduct[] = [{ name: 'Café', category: DEFAULT_CATEGORY }];
        expect(renameProducts(products, DEFAULT_CATEGORY, 'Chaud')).toEqual([{ name: 'Café', category: 'Chaud' }]);
    });

    it('renames a regular category', () => {
        const products: TestProduct[] = [
            { name: 'Thé', category: 'Boissons' },
            { name: 'Tarte', category: 'Desserts' },
        ];
        expect(renameProducts(products, 'Boissons', 'Breuvages')).toEqual([
            { name: 'Thé', category: 'Breuvages' },
            { name: 'Tarte', category: 'Desserts' },
        ]);
    });

    it('renames formula elements referencing the default category by label', () => {
        const formulas: TestFormula[] = [
            {
                name: 'Menu',
                mode: 'category',
                elements: [
                    { name: 'Boisson', category: DEFAULT_CATEGORY },
                    { name: 'Plat', category: 'Plats' },
                ],
            },
        ];
        expect(renameFormulaElements(formulas, DEFAULT_CATEGORY, 'Chaud')).toEqual([
            {
                name: 'Menu',
                mode: 'category',
                elements: [
                    { name: 'Boisson', category: 'Chaud' },
                    { name: 'Plat', category: 'Plats' },
                ],
            },
        ]);
    });

    it('leaves product-mode elements (no category) untouched', () => {
        const formulas: TestFormula[] = [{ name: 'Menu', mode: 'products', elements: [{ name: '' }] }];
        expect(renameFormulaElements(formulas, DEFAULT_CATEGORY, 'Chaud')).toEqual(formulas);
    });

    it('renames products and formula elements consistently in one pass', () => {
        const products: TestProduct[] = [{ name: 'Café', category: '' }];
        const formulas: TestFormula[] = [
            { name: 'Menu', mode: 'category', elements: [{ name: 'Boisson', category: DEFAULT_CATEGORY }] },
        ];

        const renamedProducts = renameProducts(products, DEFAULT_CATEGORY, 'Chaud');
        const renamedFormulas = renameFormulaElements(formulas, DEFAULT_CATEGORY, 'Chaud');

        expect(renamedProducts[0].category).toBe('Chaud');
        expect(renamedFormulas[0].elements[0].category).toBe('Chaud');
        // The formula element category must still resolve to the products' category
        expect(isSameCategory(renamedProducts[0].category, renamedFormulas[0].elements[0].category)).toBe(true);
    });
});

describe('applyCategoryDeletionToFormulas', () => {
    const menu = (elements: TestElement[]): TestFormula => ({ name: 'Menu', mode: 'category', elements });

    it('moves affected elements to the default label, not to an empty string', () => {
        const result = applyCategoryDeletionToFormulas<TestElement, TestFormula>(
            [menu([{ name: 'Boisson', category: 'Boissons' }])],
            'Boissons',
            true
        );

        // An empty category is treated as "unset" by the formula editor and would make the
        // formula permanently invalid.
        expect(result[0].elements[0].category).toBe(DEFAULT_CATEGORY);
        expect(result[0].elements[0].category).not.toBe('');
    });

    it('leaves elements of other categories untouched when moving', () => {
        const result = applyCategoryDeletionToFormulas<TestElement, TestFormula>(
            [
                menu([
                    { name: 'Boisson', category: 'Boissons' },
                    { name: 'Plat', category: 'Plats' },
                ]),
            ],
            'Boissons',
            true
        );

        expect(result[0].elements).toEqual([
            { name: 'Boisson', category: DEFAULT_CATEGORY },
            { name: 'Plat', category: 'Plats' },
        ]);
    });

    it('drops an element that would duplicate an existing default-category element', () => {
        const result = applyCategoryDeletionToFormulas<TestElement, TestFormula>(
            [
                menu([
                    { name: 'Divers', category: DEFAULT_CATEGORY },
                    { name: 'Boisson', category: 'Boissons' },
                ]),
            ],
            'Boissons',
            true
        );

        // A formula may only reference a given category once
        expect(result[0].elements).toEqual([{ name: 'Divers', category: DEFAULT_CATEGORY }]);
    });

    it('removes affected elements when not moving them', () => {
        const result = applyCategoryDeletionToFormulas<TestElement, TestFormula>(
            [
                menu([
                    { name: 'Boisson', category: 'Boissons' },
                    { name: 'Plat', category: 'Plats' },
                ]),
            ],
            'Boissons',
            false
        );

        expect(result[0].elements).toEqual([{ name: 'Plat', category: 'Plats' }]);
    });

    it('drops a category formula left without any element', () => {
        const result = applyCategoryDeletionToFormulas<TestElement, TestFormula>(
            [menu([{ name: 'Boisson', category: 'Boissons' }])],
            'Boissons',
            false
        );

        // A category formula with no element can never satisfy the editor validation again
        expect(result).toEqual([]);
    });

    it('never touches product-mode formulas', () => {
        const formulas: TestFormula[] = [{ name: 'Duo', mode: 'products', elements: [{ name: '' }] }];

        expect(applyCategoryDeletionToFormulas<TestElement, TestFormula>(formulas, 'Boissons', false)).toEqual(
            formulas
        );
        expect(applyCategoryDeletionToFormulas<TestElement, TestFormula>(formulas, 'Boissons', true)).toEqual(formulas);
    });

    it('matches the default category stored as an empty string', () => {
        const result = applyCategoryDeletionToFormulas<TestElement, TestFormula>(
            [menu([{ name: 'Divers', category: DEFAULT_CATEGORY }])],
            '',
            false
        );

        expect(result).toEqual([]);
    });
});
