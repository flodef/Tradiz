import { createContext, useContext } from 'react';

export interface PopupContextState {
    isPopupOpen: boolean;
    openPopup: (title: string, options: string[], action?: (option: string, index: number) => void) => void;
    closePopup: () => void;
    popupTitle: string;
    popupOptions: string[];
    popupAction?: (option: string, index: number) => void;
}

export const PopupContext = createContext<PopupContextState>({} as PopupContextState);

export function usePopup(): PopupContextState {
    return useContext(PopupContext);
}
