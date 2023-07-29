import { FC } from 'react';

interface CloseButtonProps {
    onClose: () => void;
}

export const CloseButton: FC<CloseButtonProps> = ({ onClose }) => {
    return (
        <div
            className={
                'box-content rounded-full border-none self-center hover:no-underline hover:opacity-75 focus:opacity-100 focus:shadow-none focus:outline-none p-3 ' +
                'active:bg-secondary-active-light dark:active:bg-secondary-active-dark'
            }
            onClick={onClose}
            aria-label="Close"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="3"
                stroke="currentColor"
                className="h-6 w-6"
            >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </div>
    );
};
