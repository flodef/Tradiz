import { FC, ReactNode, useCallback, useState } from 'react';
import { PopupContext } from '../hooks/usePopup';

export interface PopupProviderProps {
    children: ReactNode;
}

export const PopupProvider: FC<PopupProviderProps> = ({ children }) => {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [popupOptions, setPopupOptions] = useState<string[]>([]);
    const [popupAction, setPopupAction] = useState<(option: string) => void>(() => {});

    const openPopup = useCallback((options: string[], action: (option: string) => void) => {
        setPopupOptions(options);
        setPopupAction(() => action);
        setIsPopupOpen(true);
    }, []);

    const closePopup = useCallback(() => {
        setIsPopupOpen(false);
    }, []);

    return (
        <PopupContext.Provider
            value={{
                isPopupOpen,
                openPopup,
                closePopup,
                popupOptions,
                popupAction,
            }}
        >
            {children}
        </PopupContext.Provider>
    );
};
