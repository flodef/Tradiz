import { FC, useCallback } from 'react';
import { usePopup } from '../hooks/usePopup';
import { CloseButton } from './CloseButton';
import { Separator } from './Separator';

export function useAddPopupClass(className: string): string {
    const { isPopupOpen } = usePopup();

    return className + (isPopupOpen ? ' blur-sm pointer-events-none ' : '');
}

function useRemovePopupClass(className: string): string {
    const { isPopupOpen } = usePopup();

    return className + (isPopupOpen ? '' : ' hidden ');
}

export const Popup: FC = () => {
    const { popupTitle, popupOptions, popupAction, popupSpecialAction, openPopup, closePopup } = usePopup();
    const optionCount = popupOptions.filter((option) => option.trim()).length;

    const handleClick = useCallback(
        (option: string, index: number) => {
            if (!popupAction) return;

            popupAction(option, index);
            closePopup();
        },
        [closePopup, popupAction]
    );

    const handleContextMenu = useCallback(
        (option: string, index: number) => {
            if (!popupSpecialAction) return;

            openPopup(popupSpecialAction.confirmTitle, ['Oui', 'Non'], (confirmOption) => {
                if (confirmOption === 'Oui') {
                    popupSpecialAction.action(option, index);
                } else {
                    setTimeout(() => openPopup(popupTitle, popupOptions, popupAction, popupSpecialAction));
                }
            });
        },
        [openPopup, popupSpecialAction, popupAction, popupOptions, popupTitle]
    );

    return (
        // <div className={removePopupClass('z-20 opacity-50 bg-gray-900 h-screen w-screen grid absolute')}>
        <div
            className={useRemovePopupClass(
                'z-30 w-5/6 max-h-[90%] overflow-y-auto absolute opacity-100 brightness-100 justify-self-center bg-slate-100 h-fit rounded-2xl self-center blur-none border-black'
            )}
            style={{ borderWidth: 'medium' }}
        >
            <div>
                <div className="flex justify-between">
                    <div className="text-2xl truncate font-semibold p-3">{popupTitle}</div>
                    <CloseButton onClose={closePopup} />
                </div>
                <Separator />
            </div>
            <div>
                {popupOptions.map((option, index) =>
                    option ? (
                        <div
                            className={
                                (popupAction || popupSpecialAction ? 'active:bg-lime-300 ' : '') +
                                (optionCount <= 7
                                    ? 'py-3 '
                                    : optionCount <= 10
                                    ? 'py-2 '
                                    : optionCount <= 13
                                    ? 'py-1 '
                                    : '') +
                                'w-full relative flex justify-center items-center font-semibold text-xl text-center'
                            }
                            key={index}
                            onClick={() => handleClick(option, index)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                handleContextMenu(option, index);
                            }}
                        >
                            {option}
                        </div>
                    ) : (
                        <Separator key={index} color="border-lime-300" />
                    )
                )}
            </div>
        </div>
        // </div>
    );
};
