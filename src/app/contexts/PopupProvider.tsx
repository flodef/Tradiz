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
    const [popupSpecialAction, setPopupSpecialAction] = useState<{
        confirmTitle: string;
        action: (index: number) => void;
        maxIndex?: number;
    }>();
    const [popupIsSpecial, setPopupIsSpecial] = useState<(option: string) => boolean>();

    const openPopup = useCallback(
        (
            title: string,
            options: string[] | ReactNode[],
            action?: (index: number, option: string) => void,
            stayOpen = false,
            specialAction?: { confirmTitle: string; action: (index: number) => void; maxIndex?: number },
            isSpecial?: (option: string) => boolean
        ) => {
            setPopupTitle(title);
            setPopupOptions(options);
            setPopupAction(() => action);
            setPopupStayOpen(stayOpen);
            setPopupSpecialAction(() => specialAction);
            setPopupIsSpecial(() => isSpecial);

            setTimeout(() => {
                setIsPopupOpen(true);
            }, 100);
        },
        []
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
                closePopup,
                popupTitle,
                popupOptions,
                popupAction,
                popupStayOpen,
                popupSpecialAction,
                popupIsSpecial,
            }}
        >
            {children}
        </PopupContext.Provider>
    );
};
