'use client';

import { adminInputStyle, adminTextStyle } from '@/app/utils/constants';
import React from 'react';

interface AdminInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: boolean;
    containerClassName?: string;
}

export default function AdminInput({
    label,
    error = false,
    className = '',
    containerClassName = '',
    disabled = false,
    ...props
}: AdminInputProps) {
    return (
        <div className={`flex flex-col ${containerClassName || className}`}>
            {label && <label className={adminTextStyle}>{label}</label>}
            <input disabled={disabled} className={adminInputStyle(error)} {...props} />
        </div>
    );
}
