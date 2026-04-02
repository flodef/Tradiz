/**
 * Popup style configurations for different contexts
 * Factorized to avoid duplication and allow separate styling for main app vs admin
 */

export type PopupVariant = 'default' | 'admin';

export interface PopupStyles {
    // Container styles
    container: string;
    // Overlay styles
    overlay: string;
    // Header styles
    header: string;
    title: string;
    // Option/Item styles
    option: string;
    optionText: string;
    // Separator styles
    separator: string;
}

/**
 * Default popup styles for the main application
 */
export const defaultPopupStyles: PopupStyles = {
    container: `
        absolute z-30 w-[90%] max-h-[90%] max-w-[400px] overflow-y-auto overflow-x-hidden justify-self-center
        bg-popup-light dark:bg-popup-dark h-fit rounded-2xl self-center blur-none border-black border-[3px]
        dark:border-secondary-active-dark
    `,
    overlay: 'absolute inset-0 z-20 opacity-50 bg-gray-900',
    header: 'flex justify-between bg-secondary-active-light dark:bg-secondary-active-dark',
    title: 'text-2xl font-semibold py-3 pl-3 text-popup-dark dark:text-popup-light',
    option: 'py-2 w-full relative cursor-pointer',
    optionText: 'font-semibold text-xl whitespace-nowrap',
    separator: 'border-b-2 border-secondary-active-light dark:border-secondary-active-dark',
};

/**
 * Admin popup styles - more subtle, professional appearance
 */
export const adminPopupStyles: PopupStyles = {
    container: `
        absolute z-30 w-[90%] max-h-[90%] max-w-[400px] overflow-y-auto overflow-x-hidden justify-self-center
        bg-white dark:bg-gray-800 h-fit rounded-lg self-center blur-none border border-gray-300
        dark:border-gray-600 shadow-2xl
    `,
    overlay: 'absolute inset-0 z-20 opacity-40 bg-gray-800',
    header: 'flex justify-between bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 rounded-t-lg',
    title: 'text-xl font-semibold py-3 pl-4 text-gray-800 dark:text-gray-100',
    option: 'py-3 w-full relative cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50',
    optionText: 'font-medium text-lg text-gray-700 dark:text-gray-200',
    separator: 'border-b border-gray-200 dark:border-gray-600',
};

/**
 * Get popup styles based on variant
 */
export function getPopupStyles(variant: PopupVariant = 'default'): PopupStyles {
    return variant === 'admin' ? adminPopupStyles : defaultPopupStyles;
}

/**
 * Desktop-specific modifier styles for the container
 */
export function getDesktopContainerStyles(isFullscreen: boolean): string {
    if (isFullscreen) return '';
    return `
        md:border-0 md:w-1/2 md:max-w-[50%] md:max-h-full md:left-1/2 md:bottom-0 md:rounded-none
        md:border-l-4 md:border-secondary-active-light
    `;
}

/**
 * Get option hover styles based on device type
 */
export function getOptionHoverStyles(isMobileDevice: boolean, isStringOption: boolean): string {
    if (isMobileDevice || !isStringOption) return '';
    return 'hover:bg-active-light dark:hover:bg-active-dark active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark dark:active:text-popup-light';
}
