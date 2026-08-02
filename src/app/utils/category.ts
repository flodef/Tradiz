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
