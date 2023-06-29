import { FC, ReactNode, useCallback, useState } from 'react';
import { PopupContext } from '../hooks/usePopup';

export interface PopupProviderProps {
    children: ReactNode;
}

export const PopupProvider: FC<PopupProviderProps> = ({ children }) => {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [popupTitle, setPopupTitle] = useState<string>('');
    const [popupOptions, setPopupOptions] = useState<string[]>([]);
    const [popupAction, setPopupAction] = useState<(option: string) => void>(() => {});

    const openPopup = useCallback((title: string, options: string[], action: (option: string) => void) => {
        setTimeout(() => {
            setPopupTitle(title);
            setPopupOptions(options);
            setPopupAction(() => action);
            setIsPopupOpen(true);
        }, 100);
    }, []);

    const closePopup = useCallback(() => {
        setTimeout(() => {
            setIsPopupOpen(false);
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
            }}
        >
            {children}
        </PopupContext.Provider>
    );
};
