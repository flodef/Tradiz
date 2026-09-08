'use client';

import { adminInputStyle, adminTextStyle } from '@/app/utils/constants';
import React, { useState, useRef, useEffect } from 'react';
import { twMerge } from 'tailwind-merge';
import { IconChevronDown, IconCheck } from '@tabler/icons-react';

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
    value,
    onChange,
    ...props
}: AdminSelectProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const selectedValue = value !== undefined ? String(value) : '';
    const selectedOption = options.find((opt) => String(opt.value) === selectedValue);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    // Scroll selected option into view when opening
    useEffect(() => {
        if (!open || !listRef.current) return;
        const el = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null;
        if (el) {
            requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' }));
        }
    }, [open]);

    const handleSelect = (optValue: string) => {
        setOpen(false);
        onChange?.({ target: { value: optValue, name: props.name } } as React.ChangeEvent<HTMLSelectElement>);
    };

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isReadOnly) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
        } else if (e.key === 'Escape') {
            setOpen(false);
        } else if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
        }
    };

    return (
        <div className={twMerge('flex flex-col', containerClassName || className)} ref={containerRef}>
            {label && <label className={adminTextStyle}>{label}</label>}
            <div className="relative">
                <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => !isReadOnly && setOpen((o) => !o)}
                    onKeyDown={handleKeyDown}
                    className={twMerge(
                        adminInputStyle(error),
                        'flex items-center justify-between gap-1 cursor-pointer text-left',
                        inputClassName || 'w-full'
                    )}
                >
                    <span className={selectedOption ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}>
                        {selectedOption ? selectedOption.label : '— Choisir —'}
                    </span>
                    <IconChevronDown
                        size={16}
                        className={`text-gray-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
                    />
                </button>

                {open && (
                    <div
                        ref={listRef}
                        className="absolute top-full left-0 right-0 z-50 max-h-60 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg scrollbar-thin"
                    >
                        {options.map((opt, idx) => {
                            const isSelected = String(opt.value) === selectedValue;
                            return (
                                <button
                                    key={`${opt.value}-${idx}`}
                                    type="button"
                                    data-selected={isSelected}
                                    onClick={() => handleSelect(String(opt.value))}
                                    className={`flex items-center justify-between w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                                        isSelected
                                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <span>{opt.label}</span>
                                    {isSelected && <IconCheck size={16} className="shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            {/* Hidden native select for form compatibility */}
            <select
                disabled={isReadOnly}
                value={selectedValue}
                onChange={(e) => onChange?.(e)}
                className="hidden"
                {...props}
            >
                {options.map((opt, idx) => (
                    <option key={`${opt.value}-${idx}`} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
