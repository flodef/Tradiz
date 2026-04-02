'use client';

import { FC, useCallback } from 'react';
import { twMerge } from 'tailwind-merge';
import { usePopup } from '../hooks/usePopup';
import { useIsMobile, useIsMobileDevice } from '../utils/mobile';
import { CloseButton } from './CloseButton';
import { getPopupStyles, getDesktopContainerStyles, getOptionHoverStyles, PopupVariant } from '../utils/popupStyles';

export function useAddPopupClass(className: string): string {
    const { isPopupOpen } = usePopup();

    return className + (isPopupOpen ? ' blur-xs pointer-events-none md:blur-none md:pointer-events-auto ' : '');
}

export interface PopupProps {
    variant?: PopupVariant;
}

export const Popup: FC<PopupProps> = ({ variant = 'default' }) => {
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
    const isMobileDevice = useIsMobileDevice();
    const styles = getPopupStyles(variant);

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

    if (!isPopupOpen) return null;

    return (
        <div className="fixed inset-0 z-100 grid">
            <div onClick={close} className={styles.overlay}></div>
            <div
                id="popup" // id is mandatory for the screenshot to work
                className={twMerge(
                    styles.container,
                    !isMobile && !popupIsFullscreen ? getDesktopContainerStyles(popupIsFullscreen) : ''
                )}
            >
                <div>
                    <div className={styles.header}>
                        <div className={styles.title}>{popupTitle}</div>
                        <CloseButton onClose={close} />
                    </div>
                </div>
                <div>
                    {popupOptions.map((option, index) =>
                        option?.toString().trim() ? (
                            <div
                                className={twMerge(
                                    styles.option,
                                    typeof option === 'string'
                                        ? 'grid auto-cols-fr text-left pl-3 gap-4'
                                        : 'flex justify-around items-center text-center',
                                    getOptionHoverStyles(isMobileDevice, typeof option === 'string'),
                                    popupIsSpecial && popupIsSpecial(option.toString()) ? 'animate-pulse' : ''
                                )}
                                style={
                                    typeof option === 'string'
                                        ? { gridTemplateColumns: `repeat(${option.split('\n').length}, 1fr)` }
                                        : undefined
                                }
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
                                    ? option.split('\n').map((line, idx) => (
                                          <div key={idx} className={styles.optionText}>
                                              {line}
                                          </div>
                                      ))
                                    : option}
                            </div>
                        ) : (
                            <div key={index} className={styles.separator} />
                        )
                    )}
                </div>
            </div>
        </div>
    );
};
