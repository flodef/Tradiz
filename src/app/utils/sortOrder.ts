/**
 * Shared grid constants and sort_order encode/decode utilities.
 *
 * The sort_order encoding is used across the POS to pack a (category, position)
 * pair into a single integer:
 *
 *   sort_order = (categoryIndex + 1) * 10000 + positionWithinCategory
 *
 * In catalog mode the position is a grid slot encoded as `row * 100 + col`
 * (max 6×6 grid). In list mode the position is a sequential index.
 *
 * This module is the single source of truth for the encoding so that the
 * API route, the admin editor, and the customer-facing catalog all agree.
 */

export const GRID_COLS = 6;
export const GRID_ROWS = 6;
export const MAX_PRODUCTS = GRID_COLS * GRID_ROWS;
export const CATEGORY_MULTIPLIER = 10000;

/**
 * Encode a gridPosition (row-major 0–35) into a catalog position (row * 100 + col).
 */
export function encodeGridPosition(gridPosition: number): number {
    return Math.floor(gridPosition / GRID_COLS) * 100 + (gridPosition % GRID_COLS);
}

/**
 * Encode a (categoryIndex, positionWithinCategory) pair into a sort_order.
 */
export function encodeSortOrder(categoryIndex: number, positionWithinCategory: number): number {
    return (categoryIndex + 1) * CATEGORY_MULTIPLIER + positionWithinCategory;
}

/**
 * Extract the category index (0-based) from a sort_order value.
 */
export function decodeCategoryIndex(sortOrder: number): number {
    return Math.floor(sortOrder / CATEGORY_MULTIPLIER) - 1;
}

/**
 * Extract the position within the category from a sort_order value.
 */
export function decodePosition(sortOrder: number): number {
    return sortOrder % CATEGORY_MULTIPLIER;
}

/**
 * Decode a sort_order's position part back into a gridPosition (row-major 0–35).
 * Returns `undefined` when the position doesn't fit in the 6×6 grid (list mode
 * or out-of-range), so the caller can fall back to sequential placement.
 */
export function decodeGridPosition(sortOrder: number): number | undefined {
    const pos = decodePosition(sortOrder);
    const row = Math.floor(pos / 100);
    const col = pos % 100;
    if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
        return row * GRID_COLS + col;
    }
    return undefined;
}

/**
 * Decode a sort_order directly into a grid slot index (0–35), or `undefined`
 * if the position doesn't fit the grid.
 */
export function decodeGridSlot(sortOrder: number): number | undefined {
    const pos = decodePosition(sortOrder);
    const row = Math.floor(pos / 100);
    const col = pos % 100;
    if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
        return row * GRID_COLS + col;
    }
    return undefined;
}
