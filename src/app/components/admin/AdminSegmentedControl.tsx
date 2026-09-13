'use client';

import { adminTextStyle } from '@/app/utils/constants';
import React from 'react';
import { twMerge } from 'tailwind-merge';

interface AdminSegmentedControlProps {
    label?: string;
    options: { label: string; value: string }[];
    value: string;
    onChange: (value: string) => void;
    isReadOnly?: boolean;
    containerClassName?: string;
}

/** Two/three-option toggle group styled like the other admin controls:
 * the selected segment uses the secondary-active theme colors. */
export default function AdminSegmentedControl({
    label,
    options,
    value,
    onChange,
    isReadOnly = false,
    containerClassName = '',
}: AdminSegmentedControlProps) {
    return (
        <div className={twMerge('flex flex-col', containerClassName)}>
            {label && <label className={adminTextStyle}>{label}</label>}
            <div className="inline-flex self-start rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 overflow-hidden">
                {options.map((opt) => {
                    const selected = opt.value === value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            disabled={isReadOnly}
                            aria-pressed={selected}
                            onClick={() => onChange(opt.value)}
                            className={`px-4 py-1.5 text-sm font-semibold transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                                selected
                                    ? 'bg-secondary-active-light dark:bg-secondary-active-dark text-popup-dark dark:text-popup-light'
                                    : 'text-writing-light dark:text-writing-dark hover:bg-gray-100 dark:hover:bg-gray-600'
                            }`}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
