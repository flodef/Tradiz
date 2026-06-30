'use client';

import { useState, ChangeEvent, useEffect } from 'react';
import AdminInput from './AdminInput';

interface ValidatedInputProps {
    value: string | number;
    onChange: (value: string | number) => void;
    placeholder?: string;
    validation?: (value: string | number) => boolean;
    type?: string;
    isReadOnly?: boolean;
    maxLength?: number;
    label?: string;
    className?: string;
    min?: number;
    max?: number;
    step?: number;
    onBlur?: () => void;
    ref?: (el: HTMLInputElement | null) => void;
    isNameField?: boolean;
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
    isReadOnly = false,
    min,
    max,
    step,
    onBlur,
    ref,
    isNameField = false,
}: ValidatedInputProps) {
    // Initialize validation state based on current value
    const [isValid, setIsValid] = useState(() => {
        if (!validation) return true;
        return validation(value);
    });

    // Re-validate when value changes externally
    useEffect(() => {
        if (validation) setIsValid(validation(value));
    }, [value, validation]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (isReadOnly) return;

        let newValue = e.target.value;

        // Handle number fields: accept , or . and remove leading zeros
        if (type === 'number') {
            // Replace comma with dot for decimal separator
            newValue = newValue.replace(',', '.');
            // Remove leading zeros but keep at least one digit
            if (newValue.startsWith('0') && newValue.length > 1 && newValue[1] !== '.') {
                newValue = newValue.replace(/^0+/, '0');
            }
        }

        // Handle text fields (names): reject numbers and normalize to first letter uppercase
        if (isNameField) {
            // Reject numbers
            newValue = newValue.replace(/[0-9]/g, '');
            // Apply first letter uppercase
            newValue = newValue.toFirstUpperCase();
        }

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
            isReadOnly={isReadOnly}
            min={min}
            max={max}
            step={step}
            onBlur={onBlur}
            ref={ref}
        />
    );
}
