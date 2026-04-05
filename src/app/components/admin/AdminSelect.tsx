'use client';

import { adminInputStyle, adminTextStyle } from '@/app/utils/constants';
import React from 'react';

interface AdminSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: { label: string; value: string | number }[];
    error?: boolean;
    containerClassName?: string;
}

export default function AdminSelect({
    label,
    options,
    className = '',
    containerClassName = '',
    disabled = false,
    error = false,
    ...props
}: AdminSelectProps) {
    return (
        <div className={`flex flex-col ${containerClassName || className}`}>
            {label && <label className={adminTextStyle}>{label}</label>}
            <select disabled={disabled} className={adminInputStyle(error)} {...props}>
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
