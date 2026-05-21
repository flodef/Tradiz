/**
 * Calculates the price input step value based on currency decimals.
 * Formula: 0.1 / (10 ^ (decimals - 1)) = 0.1 * 10 ^ (1 - decimals)
 * Examples:
 * - decimals = 0 → step = 1 (0.1 * 10 = 1)
 * - decimals = 1 → step = 0.1
 * - decimals = 2 → step = 0.01
 * - decimals = 3 → step = 0.001
 */
export function getPriceStepFromDecimals(decimals: number): number {
    if (decimals <= 0) return 1;
    return 0.1 / Math.pow(10, decimals - 1);
}

/**
 * Gets the price step from the main currency (rate = 1) in a currencies list.
 * Falls back to 2 decimals (step = 0.01) if no main currency found.
 */
export function getMainCurrencyStep(currencies: { rate: number; decimals: number }[]): number {
    const mainCurrency = currencies.find((c) => c.rate === 1) ?? currencies[0];
    return getPriceStepFromDecimals(mainCurrency?.decimals ?? 2);
}
