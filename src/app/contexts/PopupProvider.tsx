'use client';

import { FC, ReactNode, useCallback, useState } from 'react';
import { PopupContext } from '../hooks/usePopup';

export interface PopupProviderProps {
    children: ReactNode;
}

export const PopupProvider: FC<PopupProviderProps> = ({ children }) => {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [popupTitle, setPopupTitle] = useState<string>('');
    const [popupOptions, setPopupOptions] = useState<string[] | ReactNode[]>([]);
    const [popupAction, setPopupAction] = useState<(index: number, option: string) => void>();
    const [popupStayOpen, setPopupStayOpen] = useState(false);
    const [popupSpecialAction, setPopupSpecialAction] = useState<(index: number) => void>();
    const [popupIsSpecial, setPopupIsSpecial] = useState<(option: string) => boolean>();
    const [popupIsFullscreen, setPopupIsFullscreen] = useState(false);

    const openPopup = useCallback(
        (
            title: string,
            options: string[] | ReactNode[],
            action?: (index: number, option: string) => void,
            stayOpen = false,
            specialAction?: (index: number) => void,
            isSpecial?: (option: string) => boolean
        ) => {
            setPopupTitle(title);
            setPopupOptions(options);
            setPopupAction(() => action);
            setPopupStayOpen(stayOpen);
            setPopupSpecialAction(() => specialAction);
            setPopupIsSpecial(() => isSpecial);
            setPopupIsFullscreen(false);

            setTimeout(() => {
                setIsPopupOpen(true);
            }, 100);
        },
        []
    );

    const openFullscreenPopup = useCallback(
        (
            title: string,
            options: string[] | ReactNode[],
            action?: (index: number, option: string) => void,
            stayOpen = false
        ) => {
            openPopup(title, options, action, stayOpen);
            setPopupIsFullscreen(true);
        },
        [openPopup]
    );

    const closePopup = useCallback((callback?: () => void) => {
        setTimeout(() => {
            setIsPopupOpen(false);
            if (callback) callback();
        }, 100);
    }, []);

    return (
        <PopupContext.Provider
            value={{
                isPopupOpen,
                openPopup,
                openFullscreenPopup,
                closePopup,
                popupTitle,
                popupOptions,
                popupAction,
                popupStayOpen,
                popupSpecialAction,
                popupIsSpecial,
                popupIsFullscreen,
            }}
        >
            {children}
        </PopupContext.Provider>
    );
};
