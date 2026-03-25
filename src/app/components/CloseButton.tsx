import { FC } from 'react';
import { twMerge } from 'tailwind-merge';
import { ButtonSize } from '../utils/types';

interface CloseButtonProps {
    onClose: () => void;
    className?: string;
    size?: ButtonSize;
}

export const CloseButton: FC<CloseButtonProps> = ({ onClose, className, size = 'md' }) => {
    const buttonClassName = { xs: 'h-4 w-4', sm: 'h-5 w-5', md: 'h-6 w-6', lg: 'h-7 w-7', xl: 'h-8 w-8' }[size];

    const handleClose = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
    };

    return (
        <div
            className={twMerge(
                'box-content rounded-full border-none self-center hover:no-underline hover:opacity-75 focus:opacity-100 focus:shadow-none focus:outline-hidden p-3',
                'active:bg-secondary-active-light dark:active:bg-secondary-active-dark text-popup-dark dark:text-popup-light',
                className
            )}
            onClick={handleClose}
            onContextMenu={handleClose}
            aria-label="Close"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="3"
                stroke="currentColor"
                className={buttonClassName}
            >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </div>
    );
};
