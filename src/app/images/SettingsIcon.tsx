import React, { FC, SVGProps } from 'react';

export const SettingsIcon: FC<SVGProps<SVGSVGElement>> = (props) => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v6m0 6v6m5.2-14.8l-4.2 4.2m-2 2l-4.2 4.2M23 12h-6m-6 0H1m14.8 5.2l-4.2-4.2m-2-2l-4.2-4.2" />
        </svg>
    );
};
