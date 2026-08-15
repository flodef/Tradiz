'use client';

import React from 'react';
import { IconLoader2 } from '@tabler/icons-react';
import { twMerge } from 'tailwind-merge';

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
        'font-bold py-2 px-4 gap-2 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white dark:text-gray-700 hover:opacity-80 cursor-pointer';

    const variantStyles = {
        primary: 'bg-blue-600 hover:bg-blue-700',
        secondary: 'bg-gray-500 hover:bg-gray-600',
        add: 'bg-green-600 hover:bg-green-700 mt-4',
        save: 'bg-active-light dark:bg-active-dark',
        danger: 'bg-red-600 hover:bg-red-700',
    }[variant];

    return (
        <button disabled={disabled || isLoading} className={twMerge(baseStyles, variantStyles, className)} {...props}>
            {isLoading ? (
                <span className="flex items-center gap-2">
                    <IconLoader2 size={16} className="animate-spin" />
                    {children}
                </span>
            ) : (
                children
            )}
        </button>
    );
}
