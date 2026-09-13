'use client';

import React from 'react';
import { IconLoader2 } from '@tabler/icons-react';
import { twMerge } from 'tailwind-merge';

interface AdminButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'add' | 'active' | 'danger';
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
    // h-8 matches the other admin controls (inputs, selects) so buttons align
    // with them in a row. Only `primary` uses the secondary-active theme
    // color; the other variants keep their semantic colors.
    const baseStyles =
        'font-bold h-8 px-3 gap-2 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white dark:text-gray-700 hover:opacity-90 cursor-pointer';

    const variantStyles = {
        primary: 'bg-secondary-active-light dark:bg-secondary-active-dark text-popup-dark dark:text-popup-light',
        secondary: 'bg-gray-500 hover:bg-gray-600',
        add: 'bg-green-600 hover:bg-green-700',
        active: 'bg-active-light dark:bg-active-dark',
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
