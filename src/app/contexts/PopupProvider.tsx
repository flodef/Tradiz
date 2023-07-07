import { FC, ReactNode, useCallback, useState } from 'react';
import { PopupContext } from '../hooks/usePopup';

export interface PopupProviderProps {
    children: ReactNode;
}

export const PopupProvider: FC<PopupProviderProps> = ({ children }) => {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [popupTitle, setPopupTitle] = useState<string>('');
    const [popupOptions, setPopupOptions] = useState<string[]>([]);
    const [popupAction, setPopupAction] = useState<(index: number, option: string) => void>();
    const [popupSpecialAction, setPopupSpecialAction] = useState<{
        confirmTitle: string;
        action: (index: number) => void;
    }>();

    const openPopup = useCallback(
        (
            title: string,
            options: string[],
            action?: (index: number, option: string) => void,
            specialAction?: { confirmTitle: string; action: (index: number) => void }
        ) => {
            setPopupTitle(title);
            setPopupOptions(options);
            setPopupAction(() => action);
            setPopupSpecialAction(() => specialAction);

            setTimeout(() => {
                setIsPopupOpen(true);
            }, 100);
        },
        []
    );

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
                popupSpecialAction,
            }}
        >
            {children}
        </PopupContext.Provider>
    );
};
