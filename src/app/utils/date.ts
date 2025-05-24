/**
 * Format a date in French format
 * @param date The date to format (defaults to current date)
 * @returns Object containing formatted date and time strings
 */
export const formatFrenchDate = (date: Date = new Date()) => {
    const frenchDateStr = new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);

    const frenchTimeStr = new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(date);

    return { frenchDateStr, frenchTimeStr };
};

/**
 * Generate a receipt number with prefix, timestamp and random number
 * @param prefix The prefix to use for the receipt number (e.g., 'R' for receipt)
 * @param date The date to use for the timestamp (defaults to current date)
 * @returns A formatted receipt number string
 */
export const generateReceiptNumber = (prefix: string, date: Date = new Date()): string => {
    const timestamp = date.getTime();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}${timestamp.toString().slice(-8)}${random}`;
};
