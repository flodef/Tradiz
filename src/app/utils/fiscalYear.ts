export interface YearStartDate {
    month: number; // 1-12
    day: number; // 1-31
}

/**
 * Get the fiscal year for a given date.
 * If the date is before the fiscal year start date, it belongs to the previous fiscal year.
 */
export function getFiscalYearForDate(date: Date, yearStartDate: YearStartDate): number {
    const year = date.getFullYear();
    const fiscalYearStart = new Date(year, yearStartDate.month - 1, yearStartDate.day);

    // If transaction date is before fiscal year start, it belongs to previous fiscal year
    if (date < fiscalYearStart) {
        return year - 1;
    }
    return year;
}

/**
 * Get the date range (start and end) for a given fiscal year.
 */
export function getFiscalYearRange(
    fiscalYear: number,
    yearStartDate: YearStartDate
): { start: Date; end: Date } {
    const start = new Date(fiscalYear, yearStartDate.month - 1, yearStartDate.day);
    const end = new Date(fiscalYear + 1, yearStartDate.month - 1, yearStartDate.day - 1);
    return { start, end };
}

/**
 * Check if a given fiscal year is the current fiscal year.
 */
export function isCurrentFiscalYear(
    fiscalYear: number,
    yearStartDate: YearStartDate,
    now: Date = new Date()
): boolean {
    const currentYear = now.getFullYear();
    const yearStart = new Date(currentYear, yearStartDate.month - 1, yearStartDate.day);

    // If we're after the year start date, current fiscal year is the current calendar year
    // Otherwise, current fiscal year is the previous calendar year
    return now >= yearStart ? fiscalYear === currentYear : fiscalYear === currentYear - 1;
}

/**
 * Format a fiscal year for display, adding "(en cours)" if it's the current fiscal year.
 */
export function formatFiscalYearDisplay(
    fiscalYear: number,
    yearStartDate: YearStartDate,
    now: Date = new Date()
): string {
    return isCurrentFiscalYear(fiscalYear, yearStartDate, now) ? `${fiscalYear} (en cours)` : `${fiscalYear}`;
}

/**
 * Parse a transaction key (format: shopId_YYYY-MM-DD) and return the date.
 */
export function parseTransactionKeyDate(key: string): Date | null {
    const dateStr = key.split('_')[1];
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    return new Date(year, month - 1, day);
}

/**
 * Check if a transaction key falls within a fiscal year range.
 */
export function isKeyInFiscalYear(key: string, fiscalYear: number, yearStartDate: YearStartDate): boolean {
    const txDate = parseTransactionKeyDate(key);
    if (!txDate) return false;
    const { start, end } = getFiscalYearRange(fiscalYear, yearStartDate);
    return txDate >= start && txDate <= end;
}
