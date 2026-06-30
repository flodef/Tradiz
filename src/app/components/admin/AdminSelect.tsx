'use client';

import { adminInputStyle, adminTextStyle } from '@/app/utils/constants';
import React from 'react';
import { twMerge } from 'tailwind-merge';

interface AdminSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: { label: string; value: string | number }[];
    error?: boolean;
    containerClassName?: string;
    inputClassName?: string;
    isReadOnly?: boolean;
}

export default function AdminSelect({
    label,
    options,
    className = '',
    containerClassName = '',
    inputClassName = '',
    isReadOnly = false,
    error = false,
    ...props
}: AdminSelectProps) {
    return (
        <div className={`flex flex-col ${containerClassName || className}`}>
            {label && <label className={adminTextStyle}>{label}</label>}
            <select disabled={isReadOnly} className={twMerge(adminInputStyle(error), inputClassName)} {...props}>
                {options.map((opt, idx) => (
                    <option key={`${opt.value}-${idx}`} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
