import { Product } from '../../utils/interfaces';

/** Sum of the line totals, i.e. the amount currently owed for the basket. */
export const computeProductsTotal = (products: Product[]) =>
    products.reduce((total, { total: lineTotal }) => total + (lineTotal ?? 0), 0);

export interface SelectionAfterDelete {
    /** Product to select once the deletion is applied, if any. */
    selectedProduct: Product | undefined;
    amount: number;
    quantity: number;
}

/**
 * Selection state to apply after deleting the product at `deletedIndex`.
 *
 * Deleting the selected product moves the selection to the previous line so the cashier can keep
 * pressing delete, which is why `null` (meaning "clear the selection") is returned only when the
 * deleted product was not the selected one or nothing is left in the basket.
 *
 * @param remainingProducts the basket *after* the deletion
 */
export function resolveSelectionAfterDelete(
    remainingProducts: Product[],
    deletedIndex: number,
    wasSelected: boolean
): SelectionAfterDelete | null {
    if (!wasSelected || !remainingProducts.length) return null;

    const selectedProduct = remainingProducts.at(Math.max(0, deletedIndex - 1));
    return {
        selectedProduct,
        amount: selectedProduct?.amount ?? 0,
        quantity: selectedProduct?.amount ? -1 : 0,
    };
}
