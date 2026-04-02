'use client';

import { useState, ChangeEvent } from 'react';
import AdminInput from './AdminInput';

interface ValidatedInputProps {
    value: string | number;
    onChange: (value: string | number) => void;
    placeholder?: string;
    validation?: (value: string | number) => boolean;
    type?: string;
    disabled?: boolean;
    maxLength?: number;
    label?: string;
    className?: string;
    isReadOnly?: boolean;
}

export default function ValidatedInput({
    value,
    onChange,
    placeholder,
    validation,
    type = 'text',
    maxLength,
    label,
    className,
    disabled = false,
}: ValidatedInputProps) {
    const [isValid, setIsValid] = useState(true);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (disabled) return;

        const newValue = e.target.value;
        if (validation) setIsValid(validation(newValue));
        onChange(newValue);
    };

    return (
        <AdminInput
            type={type}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            maxLength={maxLength}
            error={!isValid}
            label={label}
            className={className}
            disabled={disabled}
        />
    );
}
