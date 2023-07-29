'use client';

import { FC, useCallback } from 'react';
import { usePopup } from '../hooks/usePopup';
import { CloseButton } from './CloseButton';

export function useAddPopupClass(className: string): string {
    const { isPopupOpen } = usePopup();

    return className + (isPopupOpen ? ' blur-sm pointer-events-none md:blur-none md:pointer-events-auto ' : '');
}

function useRemovePopupClass(className: string): string {
    const { isPopupOpen } = usePopup();

    return className + (isPopupOpen ? '' : ' hidden ');
}

export const Popup: FC = () => {
    const { popupTitle, popupOptions, popupAction, popupStayOpen, popupSpecialAction, openPopup, closePopup } =
        usePopup();
    const optionCount = popupOptions.filter((option) => option?.toString().trim()).length;

    const handleClick = useCallback(
        (index: number, option: string) => {
            if (!popupAction) return;

            popupAction(index, option);
            if (!popupStayOpen) closePopup();
        },
        [popupAction, closePopup, popupStayOpen]
    );

    const handleContextMenu = useCallback(
        (index: number) => {
            if (!popupSpecialAction) return;

            openPopup(
                popupSpecialAction.confirmTitle,
                ['Oui', 'Non'],
                (i) => {
                    if (i === 0) {
                        popupSpecialAction.action(index);
                    } else {
                        openPopup(popupTitle, popupOptions, popupAction, popupStayOpen, popupSpecialAction);
                    }
                },
                true
            );
        },
        [openPopup, popupSpecialAction, popupAction, popupOptions, popupTitle, popupStayOpen]
    );

    return (
        // <div className={removePopupClass('z-20 opacity-50 bg-gray-900 h-screen w-screen grid absolute')}>
        <div
            id="popup"
            className={useRemovePopupClass(
                'z-30 w-[90%] max-h-[90%] max-w-[400px] overflow-y-auto overflow-x-hidden absolute opacity-100 brightness-100 ' +
                    'justify-self-center bg-bg-light dark:bg-bg-dark h-fit rounded-2xl self-center blur-none border-black border-[3px] ' +
                    'md:border-[0px] md:w-1/2 md:max-w-[50%] md:max-h-full md:left-1/2 md:bottom-0 md:rounded-none md:border-l-4 ' +
                    'md:border-secondary-active-light dark:border-secondary-active-dark'
            )}
        >
            <div>
                <div className="flex justify-between bg-secondary-active-light dark:bg-secondary-active-dark">
                    <div className="text-2xl font-semibold py-3 pl-3">{popupTitle}</div>
                    <CloseButton
                        onClose={() => {
                            closePopup();
                            handleClick(-1, '');
                        }}
                    />
                </div>
            </div>
            <div>
                {popupOptions.map((option, index) =>
                    option?.toString().trim() ? (
                        <div
                            className={
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
                            onClick={() => handleClick(index, option.toString())}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                handleContextMenu(index);
                            }}
                        >
                            {typeof option === 'string'
                                ? option.split('\n').map((line, index) => <div key={index}>{line}</div>)
                                : option}
                        </div>
                    ) : (
                        <div
                            key={index}
                            className="border-b-2 border-secondary-active-light dark:border-secondary-active-dark"
                        />
                    )
                )}
            </div>
        </div>
        // </div>
    );
};
