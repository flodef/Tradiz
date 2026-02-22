'use client';

import { FC, useCallback } from 'react';
import { twMerge } from 'tailwind-merge';
import { usePopup } from '../hooks/usePopup';
import { isMobileDevice, useIsMobile } from '../utils/mobile';
import { CloseButton } from './CloseButton';

export function useAddPopupClass(className: string): string {
    const { isPopupOpen } = usePopup();

    return className + (isPopupOpen ? ' blur-xs pointer-events-none md:blur-none md:pointer-events-auto ' : '');
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

    const close = useCallback(() => {
        closePopup(() => {
            popupAction?.(-1, '');
        });
    }, [closePopup, popupAction]);

    const handleClick = useCallback(
        (index: number, option: string) => {
            if (!popupStayOpen) {
                closePopup(() => {
                    popupAction?.(index, option);
                });
            } else {
                popupAction?.(index, option);
            }
        },
        [popupAction, closePopup, popupStayOpen]
    );

    const isMobile = useIsMobile();

    return (
        <div className="absolute h-screen w-screen grid">
            <div
                onClick={close}
                data-open={isPopupOpen}
                className={'absolute inset-0 z-20 opacity-50 bg-gray-900 data-[open=false]:hidden'}
            ></div>
            <div
                id="popup" // id is mandatory for the screenshot to work
                data-open={isPopupOpen}
                className={twMerge(
                    'absolute z-30 w-[90%] max-h-[90%] max-w-[400px] overflow-y-auto overflow-x-hidden justify-self-center',
                    'bg-popup-light dark:bg-popup-dark h-fit rounded-2xl self-center blur-none border-black border-[3px]',
                    'dark:border-secondary-active-dark data-[open=false]:hidden',
                    !isMobile && !popupIsFullscreen
                        ? 'md:border-0 md:w-1/2 md:max-w-[50%] md:max-h-full md:left-1/2 md:bottom-0 md:rounded-none ' +
                              'md:border-l-4 md:border-secondary-active-light'
                        : ''
                )}
            >
                <div>
                    <div className="flex justify-between bg-secondary-active-light dark:bg-secondary-active-dark">
                        <div className="text-2xl font-semibold py-3 pl-3 text-popup-dark dark:text-popup-light">
                            {popupTitle}
                        </div>
                        <CloseButton onClose={close} />
                    </div>
                </div>
                <div>
                    {popupOptions.map((option, index) =>
                        option?.toString().trim() ? (
                            <div
                                className={twMerge(
                                    'py-2 w-full relative flex font-semibold text-xl cursor-pointer',
                                    typeof option === 'string' && option.includes('\n')
                                        ? 'flex-col items-start text-left pl-3'
                                        : 'justify-around items-center text-center',
                                    !isMobileDevice()
                                        ? 'hover:bg-active-light dark:hover:bg-active-dark active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark dark:active:text-popup-light'
                                        : '',
                                    popupIsSpecial && popupIsSpecial(option.toString()) ? 'animate-pulse' : ''
                                )}
                                key={index}
                                onClick={() => handleClick(index, option.toString())}
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
