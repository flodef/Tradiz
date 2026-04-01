'use client';

import { useState, ChangeEvent } from 'react';

interface ValidatedInputProps {
    value: string | number;
    onChange: (value: string | number) => void;
    placeholder?: string;
    validation?: (value: string | number) => boolean;
    type?: string;
    disabled?: boolean;
    maxLength?: number;
}

export default function ValidatedInput({
    value,
    onChange,
    placeholder,
    validation,
    type = 'text',
    disabled = false,
    maxLength,
}: ValidatedInputProps) {
    const [isValid, setIsValid] = useState(true);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (disabled) return;
        const newValue = e.target.value;
        if (validation) setIsValid(validation(newValue));
        onChange(newValue);
    };

    return (
        <input
            type={type}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            className={`w-full px-3 py-2 border rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:select-none ${
                isValid ? 'border-gray-300 dark:border-gray-600' : 'border-red-500 dark:border-red-400'
            }`}
        />
    );
}
