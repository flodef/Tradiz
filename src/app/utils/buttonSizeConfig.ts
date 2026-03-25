import { ButtonSize } from './types';

export const BUTTON_SIZE_CONFIG = {
    xs: {
        height: 10, // h-10 (40px)
        tailwindClass: 'h-10',
        rowHeight: 41, // 40px + 1px divider
        numPadBottom: 135,
    },
    sm: {
        height: 11, // h-11 (44px)
        tailwindClass: 'h-11',
        rowHeight: 45, // 44px + 1px divider
        numPadBottom: 145,
    },
    md: {
        height: 12, // h-12 (48px)
        tailwindClass: 'h-12',
        rowHeight: 49, // 48px + 1px divider
        numPadBottom: 155,
    },
    lg: {
        height: 13, // h-13 (52px)
        tailwindClass: 'h-13',
        rowHeight: 53, // 52px + 1px divider
        numPadBottom: 165,
    },
    xl: {
        height: 14, // h-14 (56px)
        tailwindClass: 'h-14',
        rowHeight: 57, // 56px + 1px divider
        numPadBottom: 175,
    },
} as const;

export const getButtonSizeConfig = (size: ButtonSize) => BUTTON_SIZE_CONFIG[size];
