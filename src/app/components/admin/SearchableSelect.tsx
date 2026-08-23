'use client';

import { adminInputStyle } from '@/app/utils/constants';
import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualKeyboardInput } from './VirtualKeyboardProvider';

interface SearchableSelectProps {
    options: { label: string; value: string }[];
    value: string | string[];
    onChange: (value: string | string[]) => void;
    placeholder?: string;
    isMulti?: boolean;
    disabled?: boolean;
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder,
    isMulti = false,
    disabled = false,
}: SearchableSelectProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const selectRef = useRef<HTMLDivElement>(null);
    const vkInput = useVirtualKeyboardInput(setSearchTerm);

    const selectedLabels = useMemo(() => {
        if (isMulti && Array.isArray(value)) {
            return value.map((val) => options.find((opt) => opt.value === val)?.label || '').join(', ');
        } else if (!isMulti) {
            return options.find((opt) => opt.value === value)?.label || '';
        }
        return '';
    }, [value, options, isMulti]);

    const filteredOptions = useMemo(() => {
        return options.filter((option) => option.label.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [options, searchTerm]);

    const handleSelect = (optionValue: string) => {
        if (isMulti) {
            const newValue = Array.isArray(value)
                ? value.includes(optionValue)
                    ? value.filter((val) => val !== optionValue)
                    : [...value, optionValue]
                : [optionValue];
            onChange(newValue);
        } else {
            onChange(optionValue);
            setIsOpen(false);
        }
        setSearchTerm('');
    };

    const handleClickOutside = (event: MouseEvent) => {
        if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="relative" ref={selectRef}>
            <div
                className={`w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 flex justify-between items-center select-none ${
                    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                {selectedLabels || placeholder}
                <IconChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            {isOpen && (
                <div className="absolute z-10 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md mt-1 shadow-lg max-h-60 overflow-y-auto">
                    <input
                        type="text"
                        placeholder="Rechercher..."
                        className={adminInputStyle()}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={vkInput.onFocus}
                        onBlur={vkInput.onBlur}
                    />
                    {filteredOptions.length === 0 ? (
                        <div className="p-3 text-gray-500 dark:text-gray-400">Aucun résultat</div>
                    ) : (
                        filteredOptions.map((option) => (
                            <div
                                key={option.value}
                                className={`p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 ${
                                    (isMulti && Array.isArray(value) && value.includes(option.value)) ||
                                    (!isMulti && value === option.value)
                                        ? 'bg-blue-100 dark:bg-blue-800'
                                        : ''
                                }`}
                                onClick={() => handleSelect(option.value)}
                            >
                                {option.label}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
