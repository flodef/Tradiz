'use client';

import { useState, ChangeEvent, useEffect } from 'react';
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
    min?: number;
    max?: number;
    step?: number;
    ref?: (el: HTMLInputElement | null) => void;
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
    min,
    max,
    step,
    ref,
}: ValidatedInputProps) {
    // Initialize validation state based on current value
    const [isValid, setIsValid] = useState(() => {
        if (!validation) return true;
        return validation(value);
    });

    // Re-validate when value changes externally
    useEffect(() => {
        if (validation) {
            setIsValid(validation(value));
        }
    }, [value, validation]);

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
            min={min}
            max={max}
            step={step}
            ref={ref}
        />
    );
}
