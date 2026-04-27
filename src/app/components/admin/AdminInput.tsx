'use client';

import { adminBaseStyle, adminTextStyle } from '@/app/utils/constants';
import React from 'react';
import { twMerge } from 'tailwind-merge';

export const adminInputStyle = (error: boolean) =>
    `h-8 px-2 py-1 ${adminBaseStyle} ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'}`;

interface AdminInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: boolean;
    containerClassName?: string;
    inputClassName?: string;
}

export default function AdminInput({
    label,
    error = false,
    className = '',
    containerClassName = '',
    inputClassName = '',
    disabled = false,
    ...props
}: AdminInputProps) {
    return (
        <div className={`flex flex-col ${containerClassName || className}`}>
            {label && <label className={adminTextStyle}>{label}</label>}
            <input
                disabled={disabled}
                className={twMerge(adminInputStyle(error), inputClassName || 'w-full')}
                {...props}
            />
        </div>
    );
}
