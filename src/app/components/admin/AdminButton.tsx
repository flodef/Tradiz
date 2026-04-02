'use client';

import React from 'react';

interface AdminButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'add' | 'save' | 'danger';
    isLoading?: boolean;
}

export default function AdminButton({
    children,
    variant = 'primary',
    isLoading = false,
    className = '',
    disabled,
    ...props
}: AdminButtonProps) {
    const baseStyles =
        'font-bold py-2 px-4 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white dark:text-gray-700 hover:opacity-80 cursor-pointer';

    const variantStyles = {
        primary: 'bg-blue-600 hover:bg-blue-700',
        secondary: 'bg-gray-500 hover:bg-gray-600',
        add: 'bg-green-600 hover:bg-green-700 mt-4',
        save: 'bg-active-light dark:bg-active-dark',
        danger: 'bg-red-600 hover:bg-red-700',
    }[variant];

    return (
        <button disabled={disabled || isLoading} className={`${baseStyles} ${variantStyles} ${className}`} {...props}>
            {isLoading ? (
                <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-current" viewBox="0 0 24 24">
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                    {children}
                </span>
            ) : (
                children
            )}
        </button>
    );
}
