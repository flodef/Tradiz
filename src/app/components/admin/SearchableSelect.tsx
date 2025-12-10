'use client';

import { useState, useMemo, useRef, useEffect } from 'react';

interface SearchableSelectProps {
    options: { label: string; value: any }[];
    value: any;
    onChange: (value: any) => void;
    placeholder?: string;
    isMulti?: boolean;
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder,
    isMulti = false,
}: SearchableSelectProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const selectRef = useRef<HTMLDivElement>(null);

    const selectedLabels = useMemo(() => {
        if (isMulti && Array.isArray(value)) {
            return value.map(val => options.find(opt => opt.value === val)?.label || '').join(', ');
        } else if (!isMulti) {
            return options.find(opt => opt.value === value)?.label || '';
        }
        return '';
    }, [value, options, isMulti]);

    const filteredOptions = useMemo(() => {
        return options.filter(option =>
            option.label.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [options, searchTerm]);

    const handleSelect = (optionValue: any) => {
        if (isMulti) {
            const newValue = Array.isArray(value)
                ? (value.includes(optionValue)
                    ? value.filter(val => val !== optionValue)
                    : [...value, optionValue])
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md cursor-pointer bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 flex justify-between items-center"
                onClick={() => setIsOpen(!isOpen)}
            >
                {selectedLabels || placeholder}
                <svg
                    className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </div>
            {isOpen && (
                <div className="absolute z-10 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md mt-1 shadow-lg max-h-60 overflow-y-auto">
                    <input
                        type="text"
                        placeholder="Rechercher..."
                        className="w-full px-3 py-2 border-b border-gray-300 dark:border-gray-600 focus:outline-hidden bg-white dark:bg-gray-700 dark:text-gray-200"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {filteredOptions.length === 0 ? (
                        <div className="p-3 text-gray-500 dark:text-gray-400">Aucun résultat</div>
                    ) : (
                        filteredOptions.map(option => (
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