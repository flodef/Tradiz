import { createContext, useContext } from 'react';

export interface PopupContextState {
    isPopupOpen: boolean;
    openPopup: (title: string, options: string[], action: (option: string) => void) => void;
    closePopup: () => void;
    popupTitle: string;
    popupOptions: string[];
    popupAction: (option: string) => void;
}

export const PopupContext = createContext<PopupContextState>({} as PopupContextState);

export function usePopup(): PopupContextState {
    return useContext(PopupContext);
}
