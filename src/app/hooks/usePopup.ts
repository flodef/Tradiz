import { createContext, useContext } from 'react';

export interface PopupContextState {
    isPopupOpen: boolean;
    openPopup: (options: string[], action: (option: string) => void) => void;
    closePopup: () => void;
    popupOptions: string[];
    popupAction: (option: string) => void;
}

export const PopupContext = createContext<PopupContextState>({} as PopupContextState);

export function usePopup(): PopupContextState {
    return useContext(PopupContext);
}
