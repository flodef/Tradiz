'use client';

import { FC, useCallback, useEffect, useState, useRef } from 'react';
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
    const [selectedIndex, setSelectedIndex] = useState(0);
    const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [popupOpenedAt, setPopupOpenedAt] = useState(0);

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

    // Reset selected index when popup opens
    useEffect(() => {
        if (isPopupOpen) {
            setSelectedIndex(0);
            optionRefs.current = [];
            setPopupOpenedAt(Date.now());
        }
    }, [isPopupOpen]);

    // Keyboard navigation
    useEffect(() => {
        if (!isPopupOpen || isMobile) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const validOptions = popupOptions.filter((opt) => opt?.toString().trim());
            if (validOptions.length === 0) return;

            // Ignore Enter key if pressed shortly after popup opened (to prevent accidental selection)
            if (e.key === 'Enter' && Date.now() - popupOpenedAt < 100) {
                return;
            }

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setSelectedIndex((prev) => (prev + 1) % validOptions.length);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setSelectedIndex((prev) => (prev - 1 + validOptions.length) % validOptions.length);
                    break;
                case 'Enter':
                    e.preventDefault();
                    const selectedOption = validOptions[selectedIndex];
                    if (selectedOption) {
                        handleClick(selectedIndex, selectedOption.toString());
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    close();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPopupOpen, isMobile, popupOptions, selectedIndex, handleClick, close, popupOpenedAt]);

    // Scroll selected option into view
    useEffect(() => {
        if (selectedIndex >= 0 && optionRefs.current[selectedIndex]) {
            optionRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

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
                    {popupOptions.map((option, index) => {
                        const validOption = option?.toString().trim();
                        const validIndex = popupOptions.filter((opt) => opt?.toString().trim()).indexOf(option);
                        if (!validOption) {
                            return <div key={index} className={styles.separator} />;
                        }
                        return (
                            <div
                                ref={(el) => {
                                    optionRefs.current[validIndex] = el;
                                }}
                                className={twMerge(
                                    styles.option,
                                    typeof option === 'string'
                                        ? 'grid auto-cols-fr text-left pl-3 gap-4'
                                        : 'flex justify-around items-center text-center py-0',
                                    getOptionHoverStyles(isMobileDevice, typeof option === 'string'),
                                    !isMobile && validIndex === selectedIndex ? 'bg-blue-100 dark:bg-blue-900' : '',
                                    popupIsSpecial && popupIsSpecial(validOption) ? 'animate-pulse' : ''
                                )}
                                style={
                                    typeof option === 'string'
                                        ? { gridTemplateColumns: `repeat(${option.split('\n').length}, 1fr)` }
                                        : undefined
                                }
                                key={index}
                                onClick={() => handleClick(index, validOption)}
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
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
