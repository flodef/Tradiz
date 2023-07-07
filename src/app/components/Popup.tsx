import { FC, useCallback } from 'react';
import { usePopup } from '../hooks/usePopup';
import { CloseButton } from './CloseButton';
import { Separator } from './Separator';

export function useAddPopupClass(className: string): string {
    const { isPopupOpen } = usePopup();

    return className + (isPopupOpen ? ' blur-sm pointer-events-none md:blur-none md:pointer-events-auto ' : '');
}

function useRemovePopupClass(className: string): string {
    const { isPopupOpen } = usePopup();

    return className + (isPopupOpen ? '' : ' hidden ');
}

export const Popup: FC = () => {
    const { popupTitle, popupOptions, popupAction, popupSpecialAction, openPopup, closePopup } = usePopup();
    const optionCount = popupOptions.filter((option) => option.trim()).length;

    const handleClick = useCallback(
        (index: number, option: string) => {
            if (!popupAction) return;

            popupAction(index, option);
            closePopup();
        },
        [closePopup, popupAction]
    );

    const handleContextMenu = useCallback(
        (index: number) => {
            if (!popupSpecialAction) return;

            openPopup(popupSpecialAction.confirmTitle, ['Oui', 'Non'], (index) => {
                if (index === 0) {
                    popupSpecialAction.action(index);
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
            id="popup"
            className={useRemovePopupClass(
                'z-30 w-[90%] max-h-[90%] max-w-[333px] overflow-y-auto absolute opacity-100 brightness-100 ' +
                    'justify-self-center bg-slate-100 h-fit rounded-2xl self-center blur-none border-black border-[3px] ' +
                    'md:border-[0px] md:w-1/2 md:max-w-[50%] md:left-1/2 md:bottom-0 md:rounded-none md:border-lime-300 md:border-l-4'
            )}
        >
            <div>
                <div className="flex justify-between bg-lime-200">
                    <div className="text-2xl truncate font-semibold py-3 pl-3">{popupTitle}</div>
                    <CloseButton onClose={closePopup} />
                </div>
                <Separator />
            </div>
            <div>
                {popupOptions.map((option, index) =>
                    option.trim() ? (
                        <div
                            className={
                                // (popupAction || popupSpecialAction ? 'active:bg-lime-300 ' : '') +
                                (optionCount <= 7
                                    ? 'py-3 '
                                    : optionCount <= 10
                                    ? 'py-2 '
                                    : optionCount <= 13
                                    ? 'py-1 '
                                    : '') +
                                'w-full relative flex justify-around items-center font-semibold text-xl text-center'
                            }
                            key={index}
                            onClick={() => handleClick(index, option)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                handleContextMenu(index);
                            }}
                        >
                            {option.split('\n').map((line, index) => (
                                <div key={index}>{line}</div>
                            ))}
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
