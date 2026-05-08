/**
 * Parameter keys used throughout the application
 * These keys correspond to the parameters stored in the database
 */

export const PARAMETER_KEYS = {
    SHOP_NAME: 'name',
    SHOP_ADDRESS: 'address',
    SHOP_ZIP_CODE: 'zipCode',
    SHOP_CITY: 'city',
    SHOP_SERIAL: 'serial',
    SHOP_ID: 'id',
    SHOP_EMAIL: 'email',
    THANKS_MESSAGE: 'thanksMessage',
    MERCURIAL: 'mercurial',
    CLOSING_HOUR: 'closingHour',
    YEAR_START_DATE: 'yearStartDate',
    LAST_MODIFIED: 'lastModified',
} as const;

export const PARAMETER_KEY_LIST = Object.values(PARAMETER_KEYS);

export type ParameterKey = typeof PARAMETER_KEYS[keyof typeof PARAMETER_KEYS];
