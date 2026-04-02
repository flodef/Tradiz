'use client';

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
            {label && (
                <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 mb-0.5">
                    {label}
                </label>
            )}
            <select
                disabled={disabled}
                className={`w-full h-8 px-2 py-1 text-sm border-2 rounded-md bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                    error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
                }`}
                {...props}
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
