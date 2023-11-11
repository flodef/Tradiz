'use client';

import { FC, useCallback } from 'react';
import { usePopup } from '../hooks/usePopup';
import { useIsMobile } from '../utils/mobile';
import { CloseButton } from './CloseButton';
import { requestFullscreen } from '../utils/fullscreen';

export function useAddPopupClass(className: string): string {
    const { isPopupOpen } = usePopup();

    return className + (isPopupOpen ? ' blur-sm pointer-events-none md:blur-none md:pointer-events-auto ' : '');
}

export const Popup: FC = () => {
    const {
        popupTitle,
        popupOptions,
        popupAction,
        popupStayOpen,
        popupSpecialAction,
        popupIsSpecial,
        popupIsFullscreen,
        closePopup,
        isPopupOpen,
    } = usePopup();

    const handleClick = useCallback(
        (option: string, index: number) => {
            requestFullscreen();
            if (!popupAction) return;

            popupAction(index, option);
            if (!popupStayOpen) closePopup();
        },
        [popupAction, closePopup, popupStayOpen]
    );

    return (
        <div className="absolute h-screen w-screen grid">
            <div
                data-open={isPopupOpen}
                className={'absolute inset-0 z-20 opacity-50 bg-gray-900 data-[open=false]:hidden'}
            ></div>
            <div
                id="popup" // id is mandatory for the screenshot to work
                data-open={isPopupOpen}
                className={
                    'absolute z-30 w-[90%] max-h-[90%] max-w-[400px] overflow-y-auto overflow-x-hidden justify-self-center ' +
                    'bg-popup-light dark:bg-popup-dark h-fit rounded-2xl self-center blur-none border-black border-[3px] ' +
                    'dark:border-secondary-active-dark data-[open=false]:hidden ' +
                    (!useIsMobile() && !popupIsFullscreen
                        ? 'md:border-[0px] md:w-1/2 md:max-w-[50%] md:max-h-full md:left-1/2 md:bottom-0 md:rounded-none ' +
                          'md:border-l-4 md:border-secondary-active-light'
                        : '')
                }
            >
                <div>
                    <div className="flex justify-between bg-secondary-active-light dark:bg-secondary-active-dark">
                        <div className="text-2xl font-semibold py-3 pl-3 text-popup-dark dark:text-popup-light">
                            {popupTitle}
                        </div>
                        <CloseButton
                            onClose={() => {
                                requestFullscreen();
                                closePopup(() => {
                                    handleClick('', -1);
                                });
                            }}
                        />
                    </div>
                </div>
                <div className="py-1">
                    {popupOptions.map((option, index) =>
                        option?.toString().trim() ? (
                            <div
                                className={
                                    'py-2 ' +
                                    (popupIsSpecial && popupIsSpecial(option.toString()) ? ' animate-pulse ' : '') +
                                    'w-full relative flex justify-around items-center font-semibold text-xl text-center'
                                }
                                key={index}
                                onClick={() => handleClick(option.toString(), index)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    if (popupSpecialAction) {
                                        popupSpecialAction(index);
                                    }
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
        </div>
    );
};
