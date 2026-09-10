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
    SHOP_PHONE: 'phone',
    SHOP_VAT_NUMBER: 'vatNumber',
    SHOP_NAF: 'naf',
    SHOP_LEGAL_FORM: 'legalForm',
    SHOP_LEGAL_REPRESENTATIVE: 'legalRepresentative',
    SHOP_LOGO: 'logo',
    SHOP_IMAGE: 'shopImage',
    THANKS_MESSAGE: 'thanksMessage',
    MERCURIAL: 'mercurial',
    CLOSING_HOUR: 'closingHour',
    YEAR_START_DATE: 'yearStartDate',
    LAST_MODIFIED: 'lastModified',
    PRODUCTS_SETTINGS: 'productsSettings',
    SEARCH_SETTINGS: 'searchSettings',
    DISPLAY_SETTINGS: 'displaySettings',
    USER_SWITCH: 'userSwitch',
    USE_VIRTUAL_KEYBOARD: 'useVirtualKeyboard',
    FIDELITY_RATE: 'fidelityRate',
    PENNYLANE_TOKEN: 'pennylaneToken',
    TPE_IP: 'tpeIp',
    TPE_PORT: 'tpePort',
    OPENING_HOURS: 'openingHours',
    RESERVATION_PHONE: 'reservationPhone',
    RESERVATION_EMAIL: 'reservationEmail',
    SIGNATURE_DATA: 'signatureData',
    SIGNATURE_VERSION: 'signatureVersion',
} as const;

export const PARAMETER_KEY_LIST = Object.values(PARAMETER_KEYS);

export type ParameterKey = (typeof PARAMETER_KEYS)[keyof typeof PARAMETER_KEYS];
