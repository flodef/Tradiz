import { DEFAULT_CATEGORY } from './constants';

// A product with no category is stored as an empty string in the database, but
// displayed and referenced in the admin UI as DEFAULT_CATEGORY. Formula elements
// reference categories by their *displayed* label, so the two representations
// have to be reconciled before any comparison.

/** Returns the displayed label for a stored category value. */
export function normalizeCategory(value: string | null | undefined): string {
    const trimmed = (value ?? '').trim();
    return trimmed || DEFAULT_CATEGORY;
}

/**
 * True when both values refer to the same category, tolerating the empty-string
 * form of the default category and any capitalization drift introduced by
 * `toFirstUpperCase()` normalization on input blur.
 */
export function isSameCategory(a: string | null | undefined, b: string | null | undefined): boolean {
    return normalizeCategory(a).toLowerCase() === normalizeCategory(b).toLowerCase();
}

/** Minimal shape of the formulas handled by the propagation helpers below. */
export interface CategoryFormula<E extends { category?: string }> {
    mode: 'category' | 'products';
    elements: E[];
}

/** Retargets every formula element referencing `oldLabel` to `newLabel`. */
export function renameFormulaCategory<E extends { category?: string }, F extends CategoryFormula<E>>(
    formulas: F[],
    oldLabel: string,
    newLabel: string
): F[] {
    return formulas.map((f) => ({
        ...f,
        elements: f.elements.map((el) =>
            el.category && isSameCategory(el.category, oldLabel) ? { ...el, category: newLabel } : el
        ),
    }));
}

/**
 * Propagates a category deletion to the formulas.
 *
 * `moveToDefault` moves the affected elements to DEFAULT_CATEGORY — never to the empty string,
 * which formula elements treat as "unset" and which would make the formula unsaveable. Because a
 * formula may only reference a given category once, elements that would collide after the move are
 * dropped, and category formulas left without any element are removed entirely.
 */
export function applyCategoryDeletionToFormulas<E extends { category?: string }, F extends CategoryFormula<E>>(
    formulas: F[],
    categoryLabel: string,
    moveToDefault: boolean
): F[] {
    return formulas
        .map((f) => {
            if (f.mode !== 'category') return f;

            if (!moveToDefault) {
                return {
                    ...f,
                    elements: f.elements.filter((el) => !el.category || !isSameCategory(el.category, categoryLabel)),
                };
            }

            const seen = new Set<string>();
            const elements = f.elements
                .map((el) =>
                    el.category && isSameCategory(el.category, categoryLabel)
                        ? { ...el, category: DEFAULT_CATEGORY }
                        : el
                )
                .filter((el) => {
                    if (!el.category) return true;
                    const key = normalizeCategory(el.category).toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            return { ...f, elements };
        })
        .filter((f) => f.mode !== 'category' || f.elements.length > 0);
}
