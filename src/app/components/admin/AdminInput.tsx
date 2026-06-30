'use client';

import { adminInputStyle, adminTextStyle } from '@/app/utils/constants';
import React from 'react';
import { twMerge } from 'tailwind-merge';

interface AdminInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: boolean;
    containerClassName?: string;
    inputClassName?: string;
    isReadOnly?: boolean;
    ref?: (el: HTMLInputElement | null) => void;
}

export default function AdminInput({
    label,
    error = false,
    className = '',
    containerClassName = '',
    inputClassName = '',
    isReadOnly = false,
    ref,
    ...props
}: AdminInputProps) {
    return (
        <div className={twMerge('flex flex-col', containerClassName || className)}>
            {label && <label className={adminTextStyle}>{label}</label>}
            <input
                disabled={isReadOnly}
                className={twMerge(adminInputStyle(error), inputClassName || 'w-full')}
                ref={ref}
                {...props}
            />
        </div>
    );
}
