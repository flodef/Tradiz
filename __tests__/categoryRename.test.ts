import { describe, expect, it } from 'vitest';
import { isSameCategory, normalizeCategory } from '@/app/utils/category';
import { DEFAULT_CATEGORY } from '@/app/utils/constants';

// Mirrors the rename logic in src/app/admin/edit_menu/page.tsx so the matching
// rules are covered without mounting the whole admin page.
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
    elements: TestElement[];
}

function renameProducts(products: TestProduct[], oldLabel: string, newLabel: string): TestProduct[] {
    return products.map((p) => (isSameCategory(p.category, oldLabel) ? { ...p, category: newLabel } : p));
}

function renameFormulaElements(formulas: TestFormula[], oldLabel: string, newLabel: string): TestFormula[] {
    return formulas.map((f) => ({
        ...f,
        elements: f.elements.map((el) =>
            el.category && isSameCategory(el.category, oldLabel) ? { ...el, category: newLabel } : el
        ),
    }));
}

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
                elements: [
                    { name: 'Boisson', category: DEFAULT_CATEGORY },
                    { name: 'Plat', category: 'Plats' },
                ],
            },
        ];
        expect(renameFormulaElements(formulas, DEFAULT_CATEGORY, 'Chaud')).toEqual([
            {
                name: 'Menu',
                elements: [
                    { name: 'Boisson', category: 'Chaud' },
                    { name: 'Plat', category: 'Plats' },
                ],
            },
        ]);
    });

    it('leaves product-mode elements (no category) untouched', () => {
        const formulas: TestFormula[] = [{ name: 'Menu', elements: [{ name: '' }] }];
        expect(renameFormulaElements(formulas, DEFAULT_CATEGORY, 'Chaud')).toEqual(formulas);
    });

    it('renames products and formula elements consistently in one pass', () => {
        const products: TestProduct[] = [{ name: 'Café', category: '' }];
        const formulas: TestFormula[] = [{ name: 'Menu', elements: [{ name: 'Boisson', category: DEFAULT_CATEGORY }] }];

        const renamedProducts = renameProducts(products, DEFAULT_CATEGORY, 'Chaud');
        const renamedFormulas = renameFormulaElements(formulas, DEFAULT_CATEGORY, 'Chaud');

        expect(renamedProducts[0].category).toBe('Chaud');
        expect(renamedFormulas[0].elements[0].category).toBe('Chaud');
        // The formula element category must still resolve to the products' category
        expect(isSameCategory(renamedProducts[0].category, renamedFormulas[0].elements[0].category)).toBe(true);
    });
});
