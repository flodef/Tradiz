import { ReactNode, createContext, useContext } from 'react';

export interface PopupContextState {
    isPopupOpen: boolean;
    openPopup: (
        title: string,
        options: string[] | ReactNode[],
        action?: (index: number, option: string) => void,
        stayOpen?: boolean,
        specialAction?: (index: number) => void,
        isSpecial?: (option: string) => boolean
    ) => void;
    openFullscreenPopup: (
        title: string,
        options: string[] | ReactNode[],
        action?: (index: number, option: string) => void,
        stayOpen?: boolean
    ) => void;
    closePopup: (callback?: () => void) => void;
    popupTitle: string;
    popupOptions: string[] | ReactNode[];
    popupAction?: (index: number, option: string) => void;
    popupStayOpen: boolean;
    popupSpecialAction?: (index: number) => void;
    popupIsSpecial?: (option: string) => boolean;
    popupIsFullscreen: boolean;
}

export const PopupContext = createContext<PopupContextState>({} as PopupContextState);

export function usePopup(): PopupContextState {
    return useContext(PopupContext);
}
