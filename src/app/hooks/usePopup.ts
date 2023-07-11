import { createContext, useContext } from 'react';

export interface PopupContextState {
    isPopupOpen: boolean;
    openPopup: (
        title: string,
        options: string[],
        action?: (index: number, option: string) => void,
        stayOpen?: boolean,
        specialAction?: { confirmTitle: string; action: (index: number) => void }
    ) => void;

    closePopup: () => void;
    popupTitle: string;
    popupOptions: string[];
    popupAction?: (index: number, option: string) => void;
    popupStayOpen: boolean;
    popupSpecialAction?: { confirmTitle: string; action: (index: number) => void };
}

export const PopupContext = createContext<PopupContextState>({} as PopupContextState);

export function usePopup(): PopupContextState {
    return useContext(PopupContext);
}
