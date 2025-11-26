import { TRANSACTIONS_KEYWORD } from './constants';

/**
 * Generate a transaction file name with shop ID and date
 * @param shopId The shop ID to use for the file name (defaults to TRANSACTIONS_KEYWORD)
 * @param date The date to use for the file name (defaults to current date)
 * @returns The generated file name
 */
export const getTransactionFileName = (shopId: string, date?: Date) =>
    (shopId || TRANSACTIONS_KEYWORD) + '_' + getFormattedDate(date);

/**
 * Format a date in French format
 * @param date The date to format (defaults to current date)
 * @param precision The precision of the date (defaults to 3)
 * @returns The formatted date string
 */
export const getFormattedDate = (date = new Date(), precision = 3) =>
    !isNaN(date.getTime())
        ? date.getFullYear() +
          (precision > 1 ? '-' + ('0' + (date.getMonth() + 1)).slice(-2) : '') +
          (precision > 2 ? '-' + ('0' + date.getDate()).slice(-2) : '')
        : '';

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

/**
 * Convert a Date or timestamp to MariaDB/MySQL datetime format (YYYY-MM-DD HH:MM:SS)
 * @param dateOrTimestamp The date object or timestamp in milliseconds
 * @returns A formatted datetime string compatible with MariaDB/MySQL
 */
export const toSQLDateTime = (dateOrTimestamp: Date | number): string => {
    const date = typeof dateOrTimestamp === 'number' ? new Date(dateOrTimestamp) : dateOrTimestamp;
    return date.toISOString().slice(0, 19).replace('T', ' ');
};
